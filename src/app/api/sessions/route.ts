import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const hostId = searchParams.get("hostId");
  const brandId = searchParams.get("brandId");

  const user = session.user as { id: string; role: string };

  const where: Record<string, unknown> = {};
  // Filter by scheduledStart only — avoids excluding sessions that end past the window
  if (start && end) where.scheduledStart = { gte: new Date(start), lte: new Date(end) };
  else if (start)   where.scheduledStart = { gte: new Date(start) };
  if (hostId)  where.liveHostId = hostId;
  if (brandId) where.brandId = brandId;

  // Scope by role
  if (user.role === "LIVE_HOST") {
    const host = await prisma.liveHost.findUnique({ where: { userId: user.id } });
    if (host) where.liveHostId = host.id;
  } else if (user.role === "CLIENT") {
    const client = await prisma.client.findUnique({
      where: { userId: user.id },
      include: { brands: true },
    });
    if (client) where.brandId = { in: client.brands.map((b) => b.id) };
  }

  const sessions = await prisma.session.findMany({
    where,
    select: {
      id: true, roomId: true, liveHostId: true, brandId: true, platform: true,
      scheduledStart: true, scheduledEnd: true, isCampaignDay: true, notes: true,
      slotColor: true, status: true, punctuality: true, gmv: true, actualStart: true,
      actualDurationMinutes: true,
      room: { select: { id: true, name: true } },
      brand: { select: { id: true, name: true, color: true, platform: true } },
      liveHost: { select: { displayName: true, type: true, user: { select: { name: true } } } },
    },
    orderBy: { scheduledStart: "asc" },
  });
  return Response.json(sessions, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { roomId, liveHostId, brandId, platform, scheduledStart, scheduledEnd, isCampaignDay, notes, slotColor } = await req.json();
  const newSession = await prisma.session.create({
    data: {
      ...(liveHostId ? { liveHostId } : {}),
      ...(roomId ? { roomId } : {}),
      brandId,
      platform,
      scheduledStart: new Date(scheduledStart),
      scheduledEnd: new Date(scheduledEnd),
      isCampaignDay: isCampaignDay ?? false,
      notes: notes || null,
      ...(slotColor ? { slotColor } : {}),
    },
    include: {
      room: true,
      brand: true,
      liveHost: { include: { user: { select: { name: true } } } },
    },
  });
  return Response.json(newSession, { status: 201 });
}
