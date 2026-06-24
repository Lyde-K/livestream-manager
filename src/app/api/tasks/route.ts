import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendTaskAssignmentEmail } from "@/lib/tasks/notify";
import { createCalendarEvent } from "@/lib/tasks/calendar";
import { createId } from "@/lib/tasks/id";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };

  const { searchParams } = req.nextUrl;
  const status    = searchParams.get("status") ?? undefined;
  const priority  = searchParams.get("priority") ?? undefined;
  const assignee  = searchParams.get("assignee") ?? undefined;
  const mine      = searchParams.get("mine") === "true";

  const tasks = await prisma.task.findMany({
    where: {
      ...(status   ? { status }   : {}),
      ...(priority ? { priority } : {}),
      ...(mine || assignee
        ? { assignees: { some: { userId: assignee ?? user.id } } }
        : {}),
    },
    include: {
      createdBy: { select: { id: true, name: true } },
      assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
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
    status?: string;
    priority?: string;
    dueDate?: string;
    assigneeIds?: string[];
  };

  if (!body.title?.trim()) return Response.json({ error: "Title required" }, { status: 400 });

  const assigneeIds: string[] = body.assigneeIds ?? [];

  const task = await prisma.task.create({
    data: {
      id: createId(),
      title: body.title.trim(),
      description: body.description?.trim() || null,
      status: body.status ?? "todo",
      priority: body.priority ?? "medium",
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      createdById: user.id,
      assignees: assigneeIds.length > 0
        ? { create: assigneeIds.map((uid) => ({ userId: uid })) }
        : undefined,
    },
    include: {
      createdBy: { select: { id: true, name: true } },
      assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
      _count: { select: { comments: true } },
    },
  });

  // Send assignment emails + Google Calendar event (non-blocking)
  void (async () => {
    const assignees = task.assignees.map((a) => a.user);

    for (const assignee of assignees) {
      await sendTaskAssignmentEmail({
        assigneeName: assignee.name,
        assigneeEmail: assignee.email,
        taskTitle: task.title,
        taskId: task.id,
        dueDate: task.dueDate,
        priority: task.priority,
        assignerName: user.name ?? "Someone",
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
