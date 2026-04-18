import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const { name, platform, color, clientId, isActive } = await req.json();
  const brand = await prisma.brand.update({
    where: { id },
    data: { name, platform, color, clientId: clientId || null, isActive },
  });
  return Response.json(brand);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await prisma.brand.update({ where: { id }, data: { isActive: false } });
  return Response.json({ ok: true });
}
