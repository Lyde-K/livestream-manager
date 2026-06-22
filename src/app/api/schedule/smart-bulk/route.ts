import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, eachDayOfInterval, format, getDay, addDays } from "date-fns";

// 8 time slots × 2h each
const ALL_SLOTS = [
  { value: "8am-10am",  startH: 8,  endH: 10 },
  { value: "10am-12pm", startH: 10, endH: 12 },
  { value: "12pm-2pm",  startH: 12, endH: 14 },
  { value: "3pm-5pm",   startH: 15, endH: 17 },
  { value: "5pm-7pm",   startH: 17, endH: 19 },
  { value: "8pm-10pm",  startH: 20, endH: 22 },
  { value: "10pm-12am", startH: 22, endH: 24 },
  { value: "12am-2am",  startH: 24, endH: 26 },
];

function slotToISO(dateStr: string, startH: number, endH: number) {
  // Slots with startH >= 24 spill into next day
  const base = new Date(`${dateStr}T00:00:00+08:00`);
  const startDate = startH >= 24 ? addDays(base, 1) : base;
  const endDate   = endH   >= 24 ? addDays(base, 1) : base;
  const sh = startH >= 24 ? startH - 24 : startH;
  const eh = endH   >= 24 ? endH   - 24 : endH;
  const start = `${format(startDate, "yyyy-MM-dd")}T${String(sh).padStart(2,"0")}:00:00+08:00`;
  const end   = `${format(endDate,   "yyyy-MM-dd")}T${String(eh).padStart(2,"0")}:00:00+08:00`;
  return { start, end };
}

/** How many slots per day to aim for based on target hours and day type */
function getStrategy(targetHours: number): { campaignSlots: number; regularSlots: number; fillToTarget: boolean } {
  if (targetHours >= 300) return { campaignSlots: 6, regularSlots: 6, fillToTarget: true };
  if (targetHours >= 200) return { campaignSlots: 6, regularSlots: 3, fillToTarget: false };
  return { campaignSlots: 4, regularSlots: 2, fillToTarget: false }; // 60-199h
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { brandId, targetHours, roomId, month, year, confirm } = await req.json() as {
    brandId: string; targetHours: number; roomId: string;
    month: number; year: number; confirm?: boolean;
  };

  if (!brandId || !targetHours || !roomId || !month || !year)
    return Response.json({ error: "brandId, targetHours, roomId, month and year are required" }, { status: 400 });

  // ── 1. Load brand ──
  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) return Response.json({ error: "Brand not found" }, { status: 404 });
  const platform = brand.platform;

  // ── 2. Load campaigns for month → campaign dates ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campaigns: { startDate: Date; endDate: Date }[] = await (prisma as any).campaign.findMany({
    where: {
      month, year,
      OR: [{ platform }, { platform: "BOTH" }],
    },
    select: { startDate: true, endDate: true },
  });

  const campaignDates = new Set<string>();
  for (const c of campaigns) {
    const days = eachDayOfInterval({ start: new Date(c.startDate), end: new Date(c.endDate) });
    days.forEach(d => campaignDates.add(format(d, "yyyy-MM-dd")));
  }

  // ── 3. Load hosts with preferences ──
  const hosts = await prisma.liveHost.findMany({
    where: { isActive: true, type: "FULL_TIME" },
    include: {
      user: { select: { name: true } },
      preferences: true,
      sessions: {
        where: {
          scheduledStart: {
            gte: new Date(year, month - 1, 1),
            lte: new Date(year, month, 0),
          },
        },
        select: { scheduledStart: true },
      },
    },
  });

  // ── 4. Historical performance: which (host, brand) combos perform best ──
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const perfSessions = await prisma.session.findMany({
    where: {
      brandId,
      status: "COMPLETED",
      scheduledStart: { gte: ninetyDaysAgo },
      gmv: { not: null },
      actualDurationMinutes: { not: null },
    },
    select: { liveHostId: true, gmv: true, actualDurationMinutes: true, scheduledStart: true },
  });

  // GMV/hour per host for this brand
  const hostPerf = new Map<string, { totalGmv: number; totalHours: number }>();
  // Best performing start hours (slot preference from history)
  const slotPerf = new Map<number, { totalGmv: number; totalHours: number }>();

  for (const ps of perfSessions) {
    if (!ps.gmv || !ps.actualDurationMinutes) continue;
    const hours = ps.actualDurationMinutes / 60;
    // Host performance
    if (ps.liveHostId) {
      const cur = hostPerf.get(ps.liveHostId) ?? { totalGmv: 0, totalHours: 0 };
      hostPerf.set(ps.liveHostId, { totalGmv: cur.totalGmv + ps.gmv, totalHours: cur.totalHours + hours });
    }
    // Slot performance: which start hour is best?
    const startHour = new Date(ps.scheduledStart).getUTCHours() + 8; // MYT
    const slotHour = startHour >= 24 ? startHour - 24 : startHour;
    const slot = ALL_SLOTS.find(s => s.startH === slotHour || (s.startH >= 24 && s.startH - 24 === slotHour));
    if (slot) {
      const cur = slotPerf.get(slot.startH) ?? { totalGmv: 0, totalHours: 0 };
      slotPerf.set(slot.startH, { totalGmv: cur.totalGmv + ps.gmv, totalHours: cur.totalHours + hours });
    }
  }

  // Slot 1 (8am-10am) is always excluded.
  // Slot 8 (12am-2am, startH=24) is only allowed on campaign days — filtered per-day below.
  const EXCLUDED_SLOTS = new Set([8]);       // startH=8 → 8am-10am, slot 1
  const CAMPAIGN_ONLY_SLOTS = new Set([24]); // startH=24 → 12am-2am, slot 8

  const eligibleSlots = ALL_SLOTS.filter(s => !EXCLUDED_SLOTS.has(s.startH));

  // Sort slots by historical GMV/hour, fallback to default order
  const sortedSlots = [...eligibleSlots].sort((a, b) => {
    const pa = slotPerf.get(a.startH);
    const pb = slotPerf.get(b.startH);
    const ga = pa && pa.totalHours > 0 ? pa.totalGmv / pa.totalHours : 0;
    const gb = pb && pb.totalHours > 0 ? pb.totalGmv / pb.totalHours : 0;
    return gb - ga; // best first
  });

  // Sort hosts by GMV/hour for this brand
  const rankedHosts = hosts
    .map(h => {
      const p = hostPerf.get(h.id);
      return { ...h, gmvPerHour: p && p.totalHours > 0 ? p.totalGmv / p.totalHours : 0 };
    })
    .sort((a, b) => b.gmvPerHour - a.gmvPerHour);

  // ── 5. Strategy ──
  const strategy = getStrategy(targetHours);
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(new Date(year, month - 1));
  const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get working days (Mon-Fri, excluding weekends for 5-day hosts)
  const workingDays = allDays.filter(d => {
    const dow = getDay(d);
    return dow !== 0 && dow !== 6; // skip Sun/Sat by default
  });

  let totalSlotsNeeded = Math.ceil(targetHours / 2); // each slot = 2h
  const campaignWorkingDays = workingDays.filter(d => campaignDates.has(format(d, "yyyy-MM-dd")));
  const regularWorkingDays  = workingDays.filter(d => !campaignDates.has(format(d, "yyyy-MM-dd")));

  // For fillToTarget: calculate how many regular-day slots are needed to hit target
  let regularSlotsPerDay = strategy.regularSlots;
  if (strategy.fillToTarget) {
    const campaignHours = campaignWorkingDays.length * strategy.campaignSlots * 2;
    const remainingHours = Math.max(0, targetHours - campaignHours);
    if (regularWorkingDays.length > 0) {
      regularSlotsPerDay = Math.min(6, Math.ceil(remainingHours / (regularWorkingDays.length * 2)));
    }
  }

  // ── 6. Generate sessions ──
  interface SessionPlan {
    date: string; dayOfWeek: string;
    hostId: string; hostName: string; displayName: string;
    startH: number; endH: number; slotValue: string;
    isCampaignDay: boolean;
    scheduledStart: string; scheduledEnd: string;
  }

  const plannedSessions: SessionPlan[] = [];
  // Track existing + planned per host per day to avoid doubles
  const hostDaySlots = new Map<string, Set<number>>(); // key: hostId|date → set of startH

  function getAvailableHost(dateStr: string, slotStartH: number): typeof rankedHosts[0] | null {
    const dow = getDay(new Date(dateStr));
    for (const host of rankedHosts) {
      // Parse off days (DOW indices)
      let offDows: number[] = [];
      try {
        const raw = JSON.parse(host.preferences?.offDays ?? "[]");
        offDows = raw.filter((x: unknown) => typeof x === "number");
      } catch { /**/ }
      if (offDows.includes(dow)) continue;

      // Check not already assigned this slot this day
      const key = `${host.id}|${dateStr}`;
      const used = hostDaySlots.get(key) ?? new Set<number>();
      if (used.has(slotStartH)) continue;

      // Check no existing session in the month already at this slot
      const alreadyScheduled = host.sessions.some(s => {
        const sDate = format(new Date(new Date(s.scheduledStart).getTime() + 8 * 3600_000), "yyyy-MM-dd");
        const sHour = (new Date(s.scheduledStart).getUTCHours() + 8) % 24;
        return sDate === dateStr && sHour === slotStartH % 24;
      });
      if (alreadyScheduled) continue;

      return host;
    }
    return null;
  }

  for (const day of workingDays) {
    const dateStr = format(day, "yyyy-MM-dd");
    const isCampaignDay = campaignDates.has(dateStr);
    const slotsNeeded = isCampaignDay ? strategy.campaignSlots : regularSlotsPerDay;

    // Slot 8 (12am-2am) is only available on campaign days
    const availableSlots = isCampaignDay
      ? sortedSlots
      : sortedSlots.filter(s => !CAMPAIGN_ONLY_SLOTS.has(s.startH));
    const slotsForDay = availableSlots.slice(0, slotsNeeded);

    for (const slot of slotsForDay) {
      if (totalSlotsNeeded <= 0) break;
      const host = getAvailableHost(dateStr, slot.startH);
      if (!host) continue;

      const key = `${host.id}|${dateStr}`;
      const used = hostDaySlots.get(key) ?? new Set<number>();
      used.add(slot.startH);
      hostDaySlots.set(key, used);

      const { start, end } = slotToISO(dateStr, slot.startH, slot.endH);
      const DOW_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      plannedSessions.push({
        date: dateStr,
        dayOfWeek: DOW_LABELS[getDay(day)],
        hostId: host.id,
        hostName: host.user.name,
        displayName: host.displayName,
        startH: slot.startH,
        endH: slot.endH,
        slotValue: slot.value,
        isCampaignDay,
        scheduledStart: start,
        scheduledEnd: end,
      });
      totalSlotsNeeded--;
    }
    if (totalSlotsNeeded <= 0) break;
  }

  const totalHours = plannedSessions.length * 2;
  const summary = {
    totalSessions: plannedSessions.length,
    totalHours,
    campaignDaySessions: plannedSessions.filter(s => s.isCampaignDay).length,
    regularDaySessions: plannedSessions.filter(s => !s.isCampaignDay).length,
    strategy: targetHours >= 300 ? "Heavy (12h campaign + fill to target)"
      : targetHours >= 200 ? "Medium (12h campaign, 6h regular)"
      : "Focused (campaign priority + historical best times)",
  };

  if (confirm) {
    const created = await prisma.session.createMany({
      data: plannedSessions.map(s => ({
        liveHostId: s.hostId,
        brandId,
        roomId,
        platform,
        scheduledStart: new Date(s.scheduledStart),
        scheduledEnd: new Date(s.scheduledEnd),
        isCampaignDay: s.isCampaignDay,
        status: "PENDING",
        notes: null,
      })),
    });
    return Response.json({ created: created.count, summary });
  }

  return Response.json({ preview: plannedSessions, summary, platform, brandName: brand.name });
}
