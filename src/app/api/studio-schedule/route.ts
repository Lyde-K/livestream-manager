import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "LIVE_HOST" && role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const date = req.nextUrl.searchParams.get("date"); // "YYYY-MM-DD" in MYT
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return Response.json({ error: "date param required (YYYY-MM-DD)" }, { status: 400 });

  // Convert MYT day boundaries to UTC for DB query
  const dayStartUtc = new Date(`${date}T00:00:00+08:00`);
  const dayEndUtc   = new Date(`${date}T23:59:59+08:00`);

  const sessions = await prisma.session.findMany({
    where: {
      scheduledStart: { gte: dayStartUtc, lte: dayEndUtc },
      liveHostId: { not: null }, // exclude unassigned placeholder slots
    },
    select: {
      id: true,
      scheduledStart: true,
      scheduledEnd: true,
      platform: true,
      status: true,
      isCampaignDay: true,
      brand: { select: { id: true, name: true, color: true } },
      liveHost: { select: { id: true, displayName: true } },
      room: { select: { id: true, name: true } },
    },
    orderBy: { scheduledStart: "asc" },
  });

  return Response.json({ sessions });
}
