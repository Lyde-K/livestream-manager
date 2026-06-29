export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET  ?hostId=&month=&year=
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const hostId = searchParams.get("hostId");
  const month  = Number(searchParams.get("month"));
  const year   = Number(searchParams.get("year"));

  if (!hostId || !month || !year)
    return Response.json({ error: "hostId, month, year required" }, { status: 400 });

  const violations = await prisma.hostViolation.findMany({
    where: { hostId, month, year },
    include: { brand: { select: { id: true, name: true } } },
    orderBy: { date: "asc" },
  });

  return Response.json(violations);
}

// POST — create violation
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { hostId, brandId, violationType, date, month, year, deductionAmount } = await req.json();

  if (!hostId || !violationType || !date || !month || !year)
    return Response.json({ error: "hostId, violationType, date, month, year required" }, { status: 400 });

  const violation = await prisma.hostViolation.create({
    data: {
      hostId,
      brandId: brandId || null,
      violationType,
      date,
      month,
      year,
      deductionAmount: deductionAmount ?? 50,
    },
    include: { brand: { select: { id: true, name: true } } },
  });

  return Response.json(violation);
}

// DELETE  ?id=
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  await prisma.hostViolation.delete({ where: { id } });
  return Response.json({ ok: true });
}
