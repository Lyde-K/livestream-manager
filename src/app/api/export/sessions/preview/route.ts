import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const start   = searchParams.get("start");
  const end     = searchParams.get("end");
  const brandId = searchParams.get("brandId"); // optional filter

  if (!start || !end) return Response.json({ error: "start and end required" }, { status: 400 });

  const where: Record<string, unknown> = {
    scheduledStart: { gte: new Date(start), lte: new Date(end) },
  };
  if (brandId) where.brandId = brandId;

  const sessions = await prisma.session.findMany({
    where,
    select: { scheduledStart: true, scheduledEnd: true },
  });

  const totalHours = sessions.reduce((sum, s) => {
    return sum + (new Date(s.scheduledEnd).getTime() - new Date(s.scheduledStart).getTime()) / 3_600_000;
  }, 0);

  // Admin export is more complex (more columns) — ~180 bytes per row
  const estimatedBytes = 4096 + sessions.length * 180;

  return Response.json({
    sessions: sessions.length,
    hours: Math.round(totalHours * 10) / 10,
    estimatedBytes,
  });
}
