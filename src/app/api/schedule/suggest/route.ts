import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, eachDayOfInterval, format, getDay, addDays } from "date-fns";

// Maps slot label → suggested start time shown in the schedule UI
const SLOT_START: Record<string, string> = {
  "8am-10am":   "08:00",
  "10am-12pm":  "10:00",
  "12pm-2pm":   "12:00",
  "3pm-5pm":    "15:00",
  "5pm-7pm":    "17:00",
  "8pm-10pm":   "20:00",
  "10pm-12am":  "22:00",
  "12am-2am":   "00:00",
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = Number(searchParams.get("month")) || new Date().getMonth() + 1;
  const year = Number(searchParams.get("year")) || new Date().getFullYear();
  const filterBrandId = searchParams.get("brandId") || null;

  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(new Date(year, month - 1));
  const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Load campaigns for this month to check first-2-days exception
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campaigns: { startDate: Date }[] = await (prisma as any).campaign.findMany({
    where: { month, year },
    select: { startDate: true },
  });
  // Build set of dates that are within the first 2 days of any campaign
  const campaignOpenDates = new Set<string>();
  for (const c of campaigns) {
    const start = format(new Date(c.startDate), "yyyy-MM-dd");
    const day2  = format(addDays(new Date(c.startDate), 1), "yyyy-MM-dd");
    campaignOpenDates.add(start);
    campaignOpenDates.add(day2);
  }

  // Load all full-time hosts with preferences
  const hosts = await prisma.liveHost.findMany({
    where: { isActive: true, type: "FULL_TIME" },
    include: {
      user: true,
      preferences: true,
      sessions: {
        where: { scheduledStart: { gte: monthStart, lte: monthEnd } },
        select: { scheduledStart: true, brandId: true },
      },
    },
  });

  // Compute GMV/hour per (hostId, brandId) from last 90 days of completed sessions
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const perfSessions = await prisma.session.findMany({
    where: {
      status: "COMPLETED",
      scheduledStart: { gte: ninetyDaysAgo },
      gmv: { not: null },
      actualDurationMinutes: { not: null },
    },
    select: { liveHostId: true, brandId: true, gmv: true, actualDurationMinutes: true },
  });

  const perfMap = new Map<string, { totalGmv: number; totalHours: number }>();
  for (const ps of perfSessions) {
    if (!ps.gmv || !ps.actualDurationMinutes) continue;
    const key = `${ps.liveHostId}::${ps.brandId}`;
    const cur = perfMap.get(key) ?? { totalGmv: 0, totalHours: 0 };
    perfMap.set(key, {
      totalGmv: cur.totalGmv + ps.gmv,
      totalHours: cur.totalHours + ps.actualDurationMinutes / 60,
    });
  }
  const gmvPerHour = (hostId: string, brandId: string): number => {
    const p = perfMap.get(`${hostId}::${brandId}`);
    if (!p || p.totalHours === 0) return 0;
    return p.totalGmv / p.totalHours;
  };

  // If filtering by brand, determine the top-2 performing hosts for that brand
  let top2HostIds: Set<string> | null = null;
  if (filterBrandId) {
    const ranked = hosts
      .map(h => ({ id: h.id, score: gmvPerHour(h.id, filterBrandId) }))
      .filter(h => h.score > 0)
      .sort((a, b) => b.score - a.score);
    if (ranked.length >= 2) {
      top2HostIds = new Set(ranked.slice(0, 2).map(h => h.id));
    }
  }

  const suggestions: {
    date: string;
    dayOfWeek: string;
    hostId: string;
    hostName: string;
    displayName: string;
    suggestedSlot: string;
    preferredBrandIds: string[];
    hasExistingSession: boolean;
    isOffDay: boolean;
    gmvPerHour: number;
  }[] = [];

  const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  for (const host of hosts) {
    if (top2HostIds && !top2HostIds.has(host.id)) continue;

    const prefs = host.preferences;
    // Parse slot preferences — stored as { normal: [], campaign: [] } or legacy flat array
    let normalSlots: string[] = ["8pm-10pm"];
    let campaignSlots: string[] = ["8pm-10pm"];
    if (prefs) {
      try {
        const parsed = JSON.parse(prefs.preferredSlots);
        if (Array.isArray(parsed)) {
          normalSlots = parsed.length ? parsed : ["8pm-10pm"];
          campaignSlots = parsed.length ? parsed : ["8pm-10pm"];
        } else {
          normalSlots = parsed.normal?.length ? parsed.normal : ["8pm-10pm"];
          campaignSlots = parsed.campaign?.length ? parsed.campaign : normalSlots;
        }
      } catch { /* use defaults */ }
    }
    const preferredBrands: string[] = prefs ? JSON.parse(prefs.preferredBrands) : [];

    // offDays are now recurring day-of-week indices (0=Sun … 6=Sat)
    // Handle legacy format (date strings) gracefully — treat as no off days
    const rawOffDays: unknown[] = prefs ? JSON.parse(prefs.offDays) : [];
    const offDowSet = new Set<number>(
      rawOffDays.filter((x): x is number => typeof x === "number")
    );

    for (const day of allDays) {
      const dateStr = format(day, "yyyy-MM-dd");
      const dow = getDay(day); // 0=Sun, 6=Sat

      // Skip weekends for Mon–Fri hosts
      if (host.workingDays === 5 && (dow === 0 || dow === 6)) continue;

      // Off day check — recurring by day-of-week
      // Exception: first 2 days of any campaign range override the off day
      const isRecurringOffDay = offDowSet.has(dow);
      const isCampaignOpen = campaignOpenDates.has(dateStr);
      const isOffDay = isRecurringOffDay && !isCampaignOpen;

      const existingSessions = host.sessions.filter(
        (s) => format(new Date(s.scheduledStart), "yyyy-MM-dd") === dateStr
      );
      const hasExistingSession = existingSessions.length > 0;

      if (filterBrandId && !top2HostIds && preferredBrands.length > 0 && !preferredBrands.includes(filterBrandId)) {
        continue;
      }

      // Use campaign slots on campaign-open days, normal slots otherwise
      const activeSlots = isCampaignOpen ? campaignSlots : normalSlots;
      const suggestedStart = SLOT_START[activeSlots[0] ?? "8pm-10pm"] ?? "20:00";

      suggestions.push({
        date: dateStr,
        dayOfWeek: DOW_LABELS[dow],
        hostId: host.id,
        hostName: host.user.name,
        displayName: host.displayName,
        suggestedSlot: suggestedStart,
        preferredBrandIds: preferredBrands,
        hasExistingSession,
        isOffDay,
        gmvPerHour: filterBrandId ? gmvPerHour(host.id, filterBrandId) : 0,
      });
    }
  }

  suggestions.sort((a, b) =>
    a.date.localeCompare(b.date) ||
    b.gmvPerHour - a.gmvPerHour ||
    a.hostName.localeCompare(b.hostName)
  );

  const available = suggestions.filter((s) => !s.isOffDay && !s.hasExistingSession);
  const conflicts = suggestions.filter((s) => s.hasExistingSession);
  const offDaySuggestions = suggestions.filter((s) => s.isOffDay);

  return Response.json({
    month, year, totalDays: allDays.length,
    suggestions: available.slice(0, 200),
    conflicts: conflicts.slice(0, 50),
    offDays: offDaySuggestions.slice(0, 50),
    stats: {
      available: available.length,
      conflicts: conflicts.length,
      offDays: offDaySuggestions.length,
      hosts: hosts.length,
    },
  });
}
