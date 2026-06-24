import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string };
  const { id } = await params;

  const member = await prisma.teamMember.findUnique({ where: { teamId_userId: { teamId: id, userId: user.id } } });
  if (!member || member.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { userId: string };
  await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId: id, userId: body.userId } },
    update: {},
    create: { teamId: id, userId: body.userId, role: "member" },
  });

  const team = await prisma.team.findUnique({
    where: { id },
    include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
  });

  return Response.json({ team });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string };
  const { id } = await params;

  const member = await prisma.teamMember.findUnique({ where: { teamId_userId: { teamId: id, userId: user.id } } });

  const body = await req.json() as { userId: string };
  // Allow owner to remove members, or user to remove themselves
  if (!member || (member.role !== "owner" && body.userId !== user.id))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  await prisma.teamMember.delete({ where: { teamId_userId: { teamId: id, userId: body.userId } } });
  return Response.json({ ok: true });
}
