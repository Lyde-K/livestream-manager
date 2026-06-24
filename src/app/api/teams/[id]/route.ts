import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string };
  const { id } = await params;

  const member = await prisma.teamMember.findUnique({ where: { teamId_userId: { teamId: id, userId: user.id } } });
  if (!member || member.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { name?: string; description?: string };
  const team = await prisma.team.update({
    where: { id },
    data: {
      ...(body.name ? { name: body.name.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description || null } : {}),
    },
    include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
  });

  return Response.json({ team });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  const { id } = await params;

  const member = await prisma.teamMember.findUnique({ where: { teamId_userId: { teamId: id, userId: user.id } } });
  if (!member || (member.role !== "owner" && user.role !== "ADMIN"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  await prisma.team.delete({ where: { id } });
  return Response.json({ ok: true });
}
