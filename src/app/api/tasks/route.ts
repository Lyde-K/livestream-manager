import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendTaskAssignmentEmail } from "@/lib/tasks/notify";
import { createCalendarEvent } from "@/lib/tasks/calendar";
import { createId } from "@/lib/tasks/id";
import { createNotification } from "@/lib/tasks/notifications";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };

  const { searchParams } = req.nextUrl;
  const status    = searchParams.get("status") ?? undefined;
  const priority  = searchParams.get("priority") ?? undefined;
  const teamId    = searchParams.get("teamId") ?? undefined;
  const mine      = searchParams.get("mine") === "true";

  // Find teams the current user belongs to (for scoping)
  const userTeamIds = (await prisma.teamMember.findMany({
    where: { userId: user.id },
    select: { teamId: true },
  })).map((m) => m.teamId);

  const tasks = await prisma.task.findMany({
    where: {
      ...(status   ? { status }   : {}),
      ...(priority ? { priority } : {}),
      ...(mine ? { assignees: { some: { userId: user.id } } } : {}),
      ...(teamId ? { teamId } : {}),
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
      _count: { select: { comments: true } },
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
    assigneeIds?: string[];
    teamId?: string;
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
      teamId: body.teamId || null,
      createdById: user.id,
      assignees: assigneeIds.length > 0
        ? { create: assigneeIds.map((uid) => ({ userId: uid })) }
        : undefined,
    },
    include: {
      createdBy: { select: { id: true, name: true } },
      assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
      team: { select: { id: true, name: true } },
      _count: { select: { comments: true } },
    },
  });

  // Side-effects (non-blocking)
  void (async () => {
    const assignees = task.assignees.map((a) => a.user);
    const assignerName = user.name ?? "Someone";

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
