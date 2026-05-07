import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, eachDayOfInterval, format, getDay } from "date-fns";

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

  // gmvPerHour score per (hostId+brandId)
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

  for (const host of hosts) {
    // When a brand filter is active and we have enough performance data, limit to top 2
    if (top2HostIds && !top2HostIds.has(host.id)) continue;

    const prefs = host.preferences;
    const preferredSlots: string[] = prefs ? JSON.parse(prefs.preferredSlots) : ["20:00"];
    const preferredBrands: string[] = prefs ? JSON.parse(prefs.preferredBrands) : [];
    const offDays: string[] = prefs ? JSON.parse(prefs.offDays) : [];

    const defaultSlot = preferredSlots[0] || "20:00";

    for (const day of allDays) {
      const dateStr = format(day, "yyyy-MM-dd");
      const dow = getDay(day); // 0=Sun, 6=Sat

      if (host.workingDays === 5 && (dow === 0 || dow === 6)) continue;

      const isOffDay = offDays.includes(dateStr);
      const existingSessions = host.sessions.filter(
        (s) => format(new Date(s.scheduledStart), "yyyy-MM-dd") === dateStr
      );
      const hasExistingSession = existingSessions.length > 0;

      if (filterBrandId && !top2HostIds && preferredBrands.length > 0 && !preferredBrands.includes(filterBrandId)) {
        continue;
      }

      const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

      suggestions.push({
        date: dateStr,
        dayOfWeek: DOW_LABELS[dow],
        hostId: host.id,
        hostName: host.user.name,
        displayName: host.displayName,
        suggestedSlot: defaultSlot,
        preferredBrandIds: preferredBrands,
        hasExistingSession,
        isOffDay,
        gmvPerHour: filterBrandId ? gmvPerHour(host.id, filterBrandId) : 0,
      });
    }
  }

  // Sort by date, then by performance (desc), then by host name
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
