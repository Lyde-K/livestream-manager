export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year") ? Number(searchParams.get("year")) : undefined;
  const month = searchParams.get("month") ? Number(searchParams.get("month")) : undefined;

  const where: Record<string, unknown> = {};
  if (year) where.year = year;
  if (month) where.month = month;

  const holidays = await prisma.publicHoliday.findMany({
    where,
    orderBy: { date: "asc" },
  });

  return Response.json(holidays);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { date, name } = await req.json() as { date: string; name: string };
  if (!date || !name) return Response.json({ error: "date and name required" }, { status: 400 });

  const [yearStr, monthStr] = date.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  const holiday = await prisma.publicHoliday.upsert({
    where: { date },
    update: { name, year, month },
    create: { date, name, year, month },
  });

  return Response.json(holiday, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await req.json() as { id: string };
  await prisma.publicHoliday.delete({ where: { id } });
  return Response.json({ success: true });
}
