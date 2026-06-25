import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const blackouts = await prisma.rLBlackoutDate.findMany({ orderBy: { date: "asc" } });
  return Response.json({ blackouts });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  const { date, reason } = await req.json();
  if (!date || !reason) return Response.json({ error: "date and reason required" }, { status: 400 });

  const existing = await prisma.rLBlackoutDate.findFirst({ where: { date } });
  if (existing) return Response.json({ error: "Blackout date already exists for this date" }, { status: 409 });

  const b = await prisma.rLBlackoutDate.create({
    data: { id: `rlb_${Date.now()}`, date, reason, createdBy: user.id },
  });

  await prisma.rLAuditLog.create({
    data: {
      id: `rla_${Date.now()}`,
      action: "BLACKOUT_ADD",
      detail: `Added blackout date ${date}: ${reason}`,
      performedBy: user.id,
    },
  });

  return Response.json({ ok: true, blackout: b });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const b = await prisma.rLBlackoutDate.findUnique({ where: { id } });
  if (!b) return Response.json({ error: "Not found" }, { status: 404 });

  await prisma.rLBlackoutDate.delete({ where: { id } });

  await prisma.rLAuditLog.create({
    data: {
      id: `rla_${Date.now()}`,
      action: "BLACKOUT_REMOVE",
      detail: `Removed blackout date ${b.date}: ${b.reason}`,
      performedBy: user.id,
    },
  });

  return Response.json({ ok: true });
}
