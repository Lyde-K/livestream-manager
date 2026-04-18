import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const { name, email, password } = await req.json();
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return Response.json({ error: "Not found" }, { status: 404 });
  const userUpdate: Record<string, unknown> = { name, email };
  if (password) userUpdate.password = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id: client.userId }, data: userUpdate });
  const updated = await prisma.client.findUnique({ where: { id }, include: { user: true, brands: true } });
  return Response.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return Response.json({ error: "Not found" }, { status: 404 });
  await prisma.user.delete({ where: { id: client.userId } });
  return Response.json({ ok: true });
}
