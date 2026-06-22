import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const host = await prisma.liveHost.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!host) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(host);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const { name, email, password, displayName, workingDays, isActive, type, hourlyRate, contactNo, icNo, bankName, bankAccount } = await req.json();

  const host = await prisma.liveHost.findUnique({ where: { id } });
  if (!host) return Response.json({ error: "Not found" }, { status: 404 });

  const userUpdate: Record<string, unknown> = { name, email };
  if (password) userUpdate.password = await bcrypt.hash(password, 10);

  await prisma.user.update({ where: { id: host.userId }, data: userUpdate });
  const updated = await prisma.liveHost.update({
    where: { id },
    data: {
      displayName: displayName.toUpperCase(),
      workingDays: Number(workingDays) || 0,
      ...(isActive !== undefined && { isActive }),
      ...(type && { type }),
      ...(hourlyRate !== undefined && { hourlyRate: Number(hourlyRate) }),
      ...(contactNo !== undefined && { contactNo: contactNo || null }),
      ...(icNo !== undefined && { icNo: icNo || null }),
      ...(bankName !== undefined && { bankName: bankName || null }),
      ...(bankAccount !== undefined && { bankAccount: bankAccount || null }),
    },
    include: { user: true },
  });
  return Response.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await prisma.liveHost.update({ where: { id }, data: { isActive: false } });
  return Response.json({ ok: true });
}
