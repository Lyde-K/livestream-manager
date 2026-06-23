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
  const base = new Date(`${dateStr}T00:00:00+08:00`);
  const startDate = startH >= 24 ? addDays(base, 1) : base;
  const endDate   = endH   >= 24 ? addDays(base, 1) : base;
  const sh = startH >= 24 ? startH - 24 : startH;
  const eh = endH   >= 24 ? endH   - 24 : endH;
  return {
    start: `${format(startDate, "yyyy-MM-dd")}T${String(sh).padStart(2,"0")}:00:00+08:00`,
    end:   `${format(endDate,   "yyyy-MM-dd")}T${String(eh).padStart(2,"0")}:00:00+08:00`,
  };
}

/** Slots per day cap based on target hours and day type */
function getStrategy(targetHours: number): { campaignSlots: number; regularSlots: number } {
  if (targetHours >= 300) return { campaignSlots: 6, regularSlots: 6 };
  if (targetHours >= 200) return { campaignSlots: 6, regularSlots: 3 };
  return { campaignSlots: 4, regularSlots: 2 }; // 60–199h
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { brandId, targetHours, roomId, month, year, ignoredSlots, confirm } = await req.json() as {
    brandId: string; targetHours: number; roomId: string;
    month: number; year: number; ignoredSlots?: string[]; confirm?: boolean;
  };

  if (!brandId || !targetHours || !roomId || !month || !year)
    return Response.json({ error: "brandId, targetHours, roomId, month and year are required" }, { status: 400 });

  // ── 1. Load brand ──
  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) return Response.json({ error: "Brand not found" }, { status: 404 });
  const platform = brand.platform;

  // ── 2. Campaign dates for the month ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campaigns: { startDate: Date; endDate: Date }[] = await (prisma as any).campaign.findMany({
    where: { month, year, OR: [{ platform }, { platform: "BOTH" }] },
    select: { startDate: true, endDate: true },
  });

  const campaignDates = new Set<string>();
  for (const c of campaigns) {
    eachDayOfInterval({ start: new Date(c.startDate), end: new Date(c.endDate) })
      .forEach(d => campaignDates.add(format(d, "yyyy-MM-dd")));
  }

  // ── 3. Historical slot performance (GMV/hour per slot) ──
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600_000);
  const perfSessions = await prisma.session.findMany({
    where: {
      brandId,
      status: "COMPLETED",
      scheduledStart: { gte: ninetyDaysAgo },
      gmv: { not: null },
      actualDurationMinutes: { not: null },
    },
    select: { gmv: true, actualDurationMinutes: true, scheduledStart: true },
  });

  const slotPerf = new Map<number, { totalGmv: number; totalHours: number }>();
  for (const ps of perfSessions) {
    if (!ps.gmv || !ps.actualDurationMinutes) continue;
    const startHour = (new Date(ps.scheduledStart).getUTCHours() + 8) % 24;
    const slot = ALL_SLOTS.find(s => (s.startH % 24) === startHour);
    if (!slot) continue;
    const cur = slotPerf.get(slot.startH) ?? { totalGmv: 0, totalHours: 0 };
    slotPerf.set(slot.startH, {
      totalGmv: cur.totalGmv + ps.gmv,
      totalHours: cur.totalHours + ps.actualDurationMinutes / 60,
    });
  }

  // Remove user-specified ignored slots (by slot value, e.g. "8am-10am")
  const ignoredSet = new Set(ignoredSlots ?? []);

  // Sort eligible slots by historical GMV/hour (best first)
  const sortedSlots = ALL_SLOTS
    .filter(s => !ignoredSet.has(s.value))
    .sort((a, b) => {
      const ga = slotPerf.get(a.startH);
      const gb = slotPerf.get(b.startH);
      const va = ga && ga.totalHours > 0 ? ga.totalGmv / ga.totalHours : 0;
      const vb = gb && gb.totalHours > 0 ? gb.totalGmv / gb.totalHours : 0;
      return vb - va;
    });

  // ── 4. Generate sessions — no host assigned ──
  const strategy = getStrategy(targetHours);
  const allDays = eachDayOfInterval({
    start: startOfMonth(new Date(year, month - 1)),
    end:   endOfMonth(new Date(year, month - 1)),
  });

  const DOW_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  interface SessionPlan {
    date: string; dayOfWeek: string;
    slotValue: string; startH: number; endH: number;
    isCampaignDay: boolean;
    scheduledStart: string; scheduledEnd: string;
  }

  const plannedSessions: SessionPlan[] = [];
  let slotsRemaining = Math.ceil(targetHours / 2); // each slot = 2h

  // Pass 1: campaign days first (to prioritise them)
  const campaignDaysList = allDays.filter(d => campaignDates.has(format(d, "yyyy-MM-dd")));
  const regularDaysList  = allDays.filter(d => !campaignDates.has(format(d, "yyyy-MM-dd")));

  for (const day of [...campaignDaysList, ...regularDaysList]) {
    if (slotsRemaining <= 0) break;
    const dateStr = format(day, "yyyy-MM-dd");
    const isCampaignDay = campaignDates.has(dateStr);
    const cap = isCampaignDay ? strategy.campaignSlots : strategy.regularSlots;

    const availableSlots = sortedSlots;

    const take = Math.min(cap, slotsRemaining, availableSlots.length);

    for (let i = 0; i < take; i++) {
      const slot = availableSlots[i];
      const { start, end } = slotToISO(dateStr, slot.startH, slot.endH);
      plannedSessions.push({
        date: dateStr,
        dayOfWeek: DOW_LABELS[getDay(day)],
        slotValue: slot.value,
        startH: slot.startH,
        endH: slot.endH,
        isCampaignDay,
        scheduledStart: start,
        scheduledEnd: end,
      });
      slotsRemaining--;
    }
  }

  // Pass 2: if target still not met, allow re-using days up to 6 slots max
  // (adds extra sessions on days that have capacity left)
  if (slotsRemaining > 0) {
    const usedPerDay = new Map<string, number>();
    for (const s of plannedSessions) {
      usedPerDay.set(s.date, (usedPerDay.get(s.date) ?? 0) + 1);
    }
    const usedSlotsPerDay = new Map<string, Set<number>>();
    for (const s of plannedSessions) {
      const set = usedSlotsPerDay.get(s.date) ?? new Set<number>();
      set.add(s.startH);
      usedSlotsPerDay.set(s.date, set);
    }

    for (const day of [...campaignDaysList, ...regularDaysList]) {
      if (slotsRemaining <= 0) break;
      const dateStr = format(day, "yyyy-MM-dd");
      const isCampaignDay = campaignDates.has(dateStr);
      const currentCount = usedPerDay.get(dateStr) ?? 0;
      if (currentCount >= 6) continue; // already maxed

      const usedStartHours = usedSlotsPerDay.get(dateStr) ?? new Set<number>();
      const availableSlots = sortedSlots
        .filter(s => !usedStartHours.has(s.startH));

      const remaining = Math.min(6 - currentCount, slotsRemaining, availableSlots.length);
      for (let i = 0; i < remaining; i++) {
        const slot = availableSlots[i];
        const { start, end } = slotToISO(dateStr, slot.startH, slot.endH);
        plannedSessions.push({
          date: dateStr,
          dayOfWeek: DOW_LABELS[getDay(day)],
          slotValue: slot.value,
          startH: slot.startH,
          endH: slot.endH,
          isCampaignDay,
          scheduledStart: start,
          scheduledEnd: end,
        });
        usedStartHours.add(slot.startH);
        usedSlotsPerDay.set(dateStr, usedStartHours);
        usedPerDay.set(dateStr, (usedPerDay.get(dateStr) ?? 0) + 1);
        slotsRemaining--;
      }
    }
  }

  // Sort output by date
  plannedSessions.sort((a, b) => a.date.localeCompare(b.date) || a.startH - b.startH);

  const totalHours = plannedSessions.length * 2;
  const summary = {
    totalSessions: plannedSessions.length,
    totalHours,
    campaignDaySessions: plannedSessions.filter(s => s.isCampaignDay).length,
    get regularDaySessions() { return plannedSessions.length - this.campaignDaySessions; },
    hoursShortfall: Math.max(0, targetHours - totalHours),
    strategy: targetHours >= 300 ? "Heavy (12h campaign + fill to target)"
      : targetHours >= 200 ? "Medium (12h campaign, 6h regular)"
      : "Focused (campaign priority + historical best times)",
  };

  if (confirm) {
    const created = await prisma.session.createMany({
      data: plannedSessions.map(s => ({
        liveHostId: null,
        brandId,
        roomId,
        platform,
        scheduledStart: new Date(s.scheduledStart),
        scheduledEnd:   new Date(s.scheduledEnd),
        isCampaignDay:  s.isCampaignDay,
        status: "PENDING",
        notes: null,
      })),
    });
    return Response.json({ created: created.count, summary });
  }

  return Response.json({ preview: plannedSessions, summary, platform, brandName: brand.name });
}
