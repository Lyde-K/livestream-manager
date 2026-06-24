import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/tasks/id";

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
  const user = session.user as { id: string };
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

  return Response.json({ comment }, { status: 201 });
}
