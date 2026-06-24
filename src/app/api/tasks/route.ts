import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendTaskAssignmentEmail } from "@/lib/tasks/notify";
import { createCalendarEvent } from "@/lib/tasks/calendar";
import { createId } from "@/lib/tasks/id";
import { createNotification } from "@/lib/tasks/notifications";

export function calcNextDue(from: Date, rec: { freq: string; interval?: number }): Date {
  const d = new Date(from);
  const n = Math.max(1, rec.interval ?? 1);
  if (rec.freq === "daily")   d.setDate(d.getDate() + n);
  else if (rec.freq === "weekly")  d.setDate(d.getDate() + n * 7);
  else if (rec.freq === "monthly") d.setMonth(d.getMonth() + n);
  else if (rec.freq === "yearly")  d.setFullYear(d.getFullYear() + n);
  return d;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };

  const { searchParams } = req.nextUrl;
  const status    = searchParams.get("status") ?? undefined;
  const priority  = searchParams.get("priority") ?? undefined;
  const teamId    = searchParams.get("teamId") ?? undefined;
  const mine      = searchParams.get("mine") === "true";
  const parentId  = searchParams.get("parentId") ?? undefined;

  // Find teams the current user belongs to (for scoping)
  const userTeamIds = (await prisma.teamMember.findMany({
    where: { userId: user.id },
    select: { teamId: true },
  })).map((m) => m.teamId);

  const tasks = await prisma.task.findMany({
    where: {
      ...(status    ? { status }    : {}),
      ...(priority  ? { priority }  : {}),
      ...(mine      ? { assignees: { some: { userId: user.id } } } : {}),
      ...(teamId    ? { teamId }    : {}),
      ...(parentId !== undefined ? { parentId: parentId || null } : { parentId: null }),
      // If not filtering by mine/team, exclude tasks from teams the user isn't in
      ...(!mine && !teamId ? {
        OR: [
          { teamId: null },
          { teamId: { in: userTeamIds } },
        ],
      } : {}),
    },
    include: {
      createdBy: { select: { id: true, name: true } },
      assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
      team: { select: { id: true, name: true } },
      _count: { select: { comments: true, children: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });

  return Response.json({ tasks });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string; name?: string };

  const body = await req.json() as {
    title: string;
    description?: string;
    link?: string;
    status?: string;
    priority?: string;
    dueDate?: string;
    labels?: string;
    assigneeIds?: string[];
    teamId?: string;
    parentId?: string;
    recurrence?: string | null;
  };

  if (!body.title?.trim()) return Response.json({ error: "Title required" }, { status: 400 });

  const assigneeIds: string[] = body.assigneeIds ?? [];

  const task = await prisma.task.create({
    data: {
      id: createId(),
      title: body.title.trim(),
      description: body.description?.trim() || null,
      link: body.link?.trim() || null,
      status: body.status ?? "todo",
      priority: body.priority ?? "medium",
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      labels: body.labels ?? "[]",
      teamId: body.teamId || null,
      parentId: body.parentId || null,
      recurrence: body.recurrence || null,
      nextRecurAt: body.recurrence && body.dueDate ? calcNextDue(new Date(body.dueDate), JSON.parse(body.recurrence)) : null,
      createdById: user.id,
      assignees: assigneeIds.length > 0
        ? { create: assigneeIds.map((uid) => ({ userId: uid })) }
        : undefined,
    },
    include: {
      createdBy: { select: { id: true, name: true } },
      assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
      team: { select: { id: true, name: true } },
      _count: { select: { comments: true, children: true } },
    },
  });

  // Side-effects (non-blocking)
  void (async () => {
    const assignees = task.assignees.map((a) => a.user);
    const assignerName = user.name ?? "Someone";

    // Check if due today
    const isDueToday = task.dueDate
      ? new Date(task.dueDate).toDateString() === new Date().toDateString()
      : false;

    for (const assignee of assignees) {
      // Skip notification to self
      if (assignee.id !== user.id) {
        await createNotification({
          userId: assignee.id,
          type: "task_assigned",
          title: "New task assigned",
          message: `${assignerName} assigned you: "${task.title}"`,
          taskId: task.id,
        });
      }
      // Deadline-day alert for all assignees (including self)
      if (isDueToday) {
        await createNotification({
          userId: assignee.id,
          type: "task_due_today",
          title: "⏰ Task due today",
          message: `"${task.title}" is due today — don't forget to complete it!`,
          taskId: task.id,
        });
      }
      await sendTaskAssignmentEmail({
        assigneeName: assignee.name,
        assigneeEmail: assignee.email,
        taskTitle: task.title,
        taskId: task.id,
        dueDate: task.dueDate,
        priority: task.priority,
        assignerName,
      });
    }

    if (task.dueDate) {
      const creator = await prisma.user.findUnique({
        where: { id: user.id },
        select: { googleAccessToken: true, googleRefreshToken: true, googleTokenExpiry: true },
      });
      if (creator?.googleAccessToken) {
        const eventId = await createCalendarEvent(
          {
            accessToken: creator.googleAccessToken,
            refreshToken: creator.googleRefreshToken,
            tokenExpiry: creator.googleTokenExpiry,
          },
          {
            taskId: task.id,
            title: task.title,
            description: task.description,
            dueDate: task.dueDate,
            assigneeEmails: assignees.map((a) => a.email),
          },
        );
        if (eventId) {
          await prisma.task.update({ where: { id: task.id }, data: { googleEventId: eventId } });
        }
      }
    }
  })();

  return Response.json({ task }, { status: 201 });
}
