import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendTaskAssignmentEmail } from "@/lib/tasks/notify";
import { updateCalendarEvent, deleteCalendarEvent } from "@/lib/tasks/calendar";
import { createNotification } from "@/lib/tasks/notifications";
import { calcNextDue } from "@/app/api/tasks/route";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string; name?: string };
  const { id } = await params;

  const body = await req.json() as {
    title?: string;
    description?: string;
    link?: string | null;
    status?: string;
    priority?: string;
    dueDate?: string | null;
    labels?: string;
    teamId?: string | null;
    addAssigneeIds?: string[];
    removeAssigneeIds?: string[];
    recurrence?: string | null;
  };

  const existing = await prisma.task.findUnique({
    where: { id },
    include: {
      assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const newDueDate =
    body.dueDate === null ? null
    : body.dueDate ? new Date(body.dueDate)
    : undefined;

  const task = await prisma.task.update({
    where: { id },
    data: {
      ...(body.title       !== undefined ? { title: body.title.trim() }         : {}),
      ...(body.description !== undefined ? { description: body.description }    : {}),
      ...(body.link        !== undefined ? { link: body.link || null }          : {}),
      ...(body.status      !== undefined ? { status: body.status }              : {}),
      ...(body.priority    !== undefined ? { priority: body.priority }          : {}),
      ...(newDueDate       !== undefined ? { dueDate: newDueDate }              : {}),
      ...(body.labels      !== undefined ? { labels: body.labels }              : {}),
      ...(body.teamId      !== undefined ? { teamId: body.teamId || null }      : {}),
      ...(body.recurrence  !== undefined ? { recurrence: body.recurrence || null } : {}),
      ...(body.addAssigneeIds?.length
        ? { assignees: { create: body.addAssigneeIds.map((uid) => ({ userId: uid })) } }
        : {}),
      ...(body.removeAssigneeIds?.length
        ? { assignees: { deleteMany: { userId: { in: body.removeAssigneeIds } } } }
        : {}),
    },
    include: {
      createdBy: { select: { id: true, name: true } },
      assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
      team: { select: { id: true, name: true } },
      _count: { select: { comments: true, children: true } },
    },
  });

  // Recurring task reset: when marked done, immediately reschedule
  if (body.status === "done" && existing.recurrence) {
    try {
      const rec = JSON.parse(existing.recurrence) as { freq: string; interval?: number };
      const base = existing.dueDate ?? new Date();
      const nextDue = calcNextDue(base, rec);
      const reset = await prisma.task.update({
        where: { id },
        data: { status: "todo", dueDate: nextDue, nextRecurAt: nextDue },
        include: {
          createdBy: { select: { id: true, name: true } },
          assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
          team: { select: { id: true, name: true } },
          _count: { select: { comments: true, children: true } },
        },
      });
      // Notify assignees of the reset
      for (const a of reset.assignees) {
        await createNotification({
          userId: a.user.id,
          type: "task_updated",
          title: "🔁 Recurring task reset",
          message: `"${reset.title}" has been reset for its next occurrence`,
          taskId: reset.id,
        });
      }
      return Response.json({ task: reset, recurred: true });
    } catch {
      // fall through to normal response
    }
  }

  // Side-effects (non-blocking)
  void (async () => {
    const newAssigneeIds = body.addAssigneeIds ?? [];
    if (newAssigneeIds.length > 0) {
      const newAssignees = task.assignees.filter((a) => newAssigneeIds.includes(a.userId));
      for (const a of newAssignees) {
        if (a.user.id !== user.id) {
          const isReview = body.status === "in_review";
          await createNotification({
            userId: a.user.id,
            type: isReview ? "task_review" : "task_assigned",
            title: isReview ? "Task sent for your review" : "New task assigned",
            message: isReview
              ? `${user.name ?? "Someone"} sent "${task.title}" for your review`
              : `${user.name ?? "Someone"} assigned you: "${task.title}"`,
            taskId: task.id,
          });
        }
        await sendTaskAssignmentEmail({
          assigneeName: a.user.name,
          assigneeEmail: a.user.email,
          taskTitle: task.title,
          taskId: task.id,
          dueDate: task.dueDate,
          priority: task.priority,
          assignerName: user.name ?? "Someone",
        });
      }
    }

    if (existing.googleEventId) {
      const creator = await prisma.user.findUnique({
        where: { id: existing.createdById ?? user.id },
        select: { googleAccessToken: true, googleRefreshToken: true, googleTokenExpiry: true },
      });
      if (creator?.googleAccessToken) {
        await updateCalendarEvent(
          {
            accessToken: creator.googleAccessToken,
            refreshToken: creator.googleRefreshToken,
            tokenExpiry: creator.googleTokenExpiry,
          },
          existing.googleEventId,
          {
            taskId: task.id,
            title: body.title ?? task.title,
            description: body.description ?? task.description,
            dueDate: newDueDate ?? task.dueDate ?? undefined,
            assigneeEmails: task.assignees.map((a) => a.user.email),
            done: task.status === "done",
          },
        );
      }
    }
  })();

  return Response.json({ task });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  const { id } = await params;

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  await prisma.task.delete({ where: { id } });

  if (existing.googleEventId) {
    void (async () => {
      const creator = await prisma.user.findUnique({
        where: { id: existing.createdById ?? user.id },
        select: { googleAccessToken: true, googleRefreshToken: true, googleTokenExpiry: true },
      });
      if (creator?.googleAccessToken && existing.googleEventId) {
        await deleteCalendarEvent(
          {
            accessToken: creator.googleAccessToken,
            refreshToken: creator.googleRefreshToken,
            tokenExpiry: creator.googleTokenExpiry,
          },
          existing.googleEventId,
        );
      }
    })();
  }

  return Response.json({ ok: true });
}
