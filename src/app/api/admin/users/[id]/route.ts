import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { name, email, role, newPassword } = body;

  // Prevent admin from removing their own admin role
  const currentUserId = (session.user as { id: string }).id;
  if (id === currentUserId && role && role !== "ADMIN")
    return Response.json({ error: "You cannot change your own role" }, { status: 400 });

  const target = await prisma.user.findUnique({
    where: { id },
    include: { liveHost: { select: { id: true } }, client: { select: { id: true } } },
  });
  if (!target) return Response.json({ error: "User not found" }, { status: 404 });

  // Check email uniqueness if changing email
  if (email && email !== target.email) {
    const collision = await prisma.user.findUnique({ where: { email } });
    if (collision) return Response.json({ error: "Email already in use" }, { status: 409 });
  }

  const updateData: Record<string, unknown> = {};
  if (name)        updateData.name     = name;
  if (email)       updateData.email    = email;
  if (role)        updateData.role     = role;
  if (newPassword) updateData.password = await bcrypt.hash(newPassword, 10);

  // If promoting to LIVE_HOST and no LiveHost profile exists, create one
  if (role === "LIVE_HOST" && !target.liveHost) {
    await prisma.liveHost.create({
      data: {
        userId: id,
        displayName: (name || target.name).toUpperCase(),
        workingDays: 5,
        type: "FULL_TIME",
        hourlyRate: 40,
      },
    });
  }

  // If promoting to CLIENT and no Client profile exists, create one
  if (role === "CLIENT") {
    const existing = await prisma.client.findUnique({ where: { userId: id } });
    if (!existing) await prisma.client.create({ data: { userId: id } });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: updateData,
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  return Response.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const currentUserId = (session.user as { id: string }).id;

  if (id === currentUserId)
    return Response.json({ error: "You cannot delete your own account" }, { status: 400 });

  await prisma.user.delete({ where: { id } });
  return Response.json({ ok: true });
}
