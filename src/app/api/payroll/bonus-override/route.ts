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
    return Response.json({ error: "required" }, { status: 400 });

  const override = await prisma.hostBonusOverride.findUnique({
    where: { hostId_month_year: { hostId, month, year } },
  });

  return Response.json(override ?? { attendanceGranted: null, punctualityGranted: null });
}

// PUT — upsert override
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { hostId, month, year, attendanceGranted, punctualityGranted } = await req.json();

  if (!hostId || !month || !year)
    return Response.json({ error: "required" }, { status: 400 });

  const record = await prisma.hostBonusOverride.upsert({
    where: { hostId_month_year: { hostId, month, year } },
    update: { attendanceGranted, punctualityGranted, updatedAt: new Date() },
    create: { hostId, month, year, attendanceGranted, punctualityGranted },
  });

  return Response.json(record);
}
