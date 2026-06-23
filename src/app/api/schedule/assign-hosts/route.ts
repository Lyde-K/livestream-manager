import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, subDays } from "date-fns";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { month, year, brandId, hostType, hostId: specificHostId, startDate, endDate } = await req.json();

  const monthStart = startDate ? new Date(startDate) : startOfMonth(new Date(year, month - 1));
  const monthEnd   = endDate   ? new Date(endDate)   : endOfMonth(new Date(year, month - 1));

  // Get all unassigned PENDING slots for the month
  const unassignedSlots = await prisma.session.findMany({
    where: {
      status: "PENDING",
      liveHostId: null,
      scheduledStart: { gte: monthStart, lte: monthEnd },
      ...(brandId ? { brandId } : {}),
    },
    include: { brand: true },
    orderBy: { scheduledStart: "asc" },
  });

  if (unassignedSlots.length === 0)
    return Response.json({ assigned: 0, message: "No unassigned slots found" });

  // Get hosts filtered by type/specific selection
  const perfStart = subDays(monthStart, 90);
  const hosts = await prisma.liveHost.findMany({
    where: {
      isActive: true,
      ...(specificHostId ? { id: specificHostId } : hostType ? { type: hostType } : { type: "FULL_TIME" }),
    },
    include: {
      user: { select: { name: true } },
      sessions: {
        where: { status: "COMPLETED", scheduledStart: { gte: perfStart } },
        select: { gmv: true, actualDurationMinutes: true },
      },
    },
  });

  // Rank hosts by total GMV (last 90 days)
  const rankedHosts = hosts
    .map(h => ({
      id: h.id,
      name: h.user.name,
      gmv: h.sessions.reduce((sum, s) => sum + (s.gmv ?? 0), 0),
    }))
    .sort((a, b) => b.gmv - a.gmv);

  if (rankedHosts.length === 0)
    return Response.json({ assigned: 0, message: "No active full-time hosts available" });

  // Pre-load existing sessions for the month to avoid conflicts
  const existingSessions = await prisma.session.findMany({
    where: {
      scheduledStart: { gte: monthStart, lte: monthEnd },
      liveHostId: { not: null },
      status: { not: "MISSED" },
    },
    select: { liveHostId: true, scheduledStart: true, scheduledEnd: true },
  });

  // Build conflict map: Map<hostId, {start, end}[]>
  const assignments: Map<string, { start: Date; end: Date }[]> = new Map();
  for (const h of rankedHosts) assignments.set(h.id, []);
  for (const s of existingSessions) {
    if (!s.liveHostId) continue;
    const list = assignments.get(s.liveHostId) ?? [];
    list.push({ start: s.scheduledStart, end: s.scheduledEnd });
    assignments.set(s.liveHostId, list);
  }

  function hasConflict(hostId: string, start: Date, end: Date): boolean {
    const slots = assignments.get(hostId) ?? [];
    return slots.some(s => s.start < end && s.end > start);
  }

  // Lazy-fetch default room only if any slot lacks one
  const needsRoom = unassignedSlots.some(s => !s.roomId);
  const defaultRoom = needsRoom ? await prisma.room.findFirst({ where: { isActive: true } }) : null;

  // Assign hosts by performance rank, respecting conflicts; collect updates
  const updates: { id: string; liveHostId: string; roomId?: string }[] = [];
  for (const slot of unassignedSlots) {
    const slotStart = new Date(slot.scheduledStart);
    const slotEnd = new Date(slot.scheduledEnd);

    const host = rankedHosts.find(h => !hasConflict(h.id, slotStart, slotEnd));
    if (!host) continue;

    updates.push({
      id: slot.id,
      liveHostId: host.id,
      ...(!slot.roomId && defaultRoom ? { roomId: defaultRoom.id } : {}),
    });

    const list = assignments.get(host.id)!;
    list.push({ start: slotStart, end: slotEnd });
  }

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map(u => prisma.session.update({ where: { id: u.id }, data: { liveHostId: u.liveHostId, ...(u.roomId ? { roomId: u.roomId } : {}) } }))
    );
  }

  return Response.json({ assigned: updates.length, total: unassignedSlots.length });
}
