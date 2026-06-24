import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/tasks/id";
import { createNotification } from "@/lib/tasks/notifications";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const comments = await prisma.taskComment.findMany({
    where: { taskId: id },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return Response.json({ comments });
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; name?: string };
  const { id } = await params;

  const { content } = await req.json() as { content: string };
  if (!content?.trim()) return Response.json({ error: "Content required" }, { status: 400 });

  const comment = await prisma.taskComment.create({
    data: {
      id: createId(),
      taskId: id,
      userId: user.id,
      content: content.trim(),
    },
    include: { user: { select: { id: true, name: true } } },
  });

  // Notify task creator + assignees (excluding commenter) non-blockingly
  void (async () => {
    const task = await prisma.task.findUnique({
      where: { id },
      include: { assignees: { select: { userId: true } }, createdBy: { select: { id: true } } },
    });
    if (!task) return;
    const recipientIds = new Set([
      ...(task.createdBy ? [task.createdBy.id] : []),
      ...task.assignees.map((a) => a.userId),
    ]);
    recipientIds.delete(user.id);
    for (const uid of recipientIds) {
      await createNotification({
        userId: uid,
        type: "task_comment",
        title: "New comment on task",
        message: `${user.name ?? "Someone"} commented on "${task.title}": ${content.trim().slice(0, 80)}`,
        taskId: id,
      });
    }
  })();

  return Response.json({ comment }, { status: 201 });
}
