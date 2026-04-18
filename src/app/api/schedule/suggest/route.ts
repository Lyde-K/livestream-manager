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
  }[] = [];

  for (const host of hosts) {
    const prefs = host.preferences;
    const preferredSlots: string[] = prefs ? JSON.parse(prefs.preferredSlots) : ["20:00"];
    const preferredBrands: string[] = prefs ? JSON.parse(prefs.preferredBrands) : [];
    const offDays: string[] = prefs ? JSON.parse(prefs.offDays) : [];

    // Default slot if none set
    const defaultSlot = preferredSlots[0] || "20:00";

    for (const day of allDays) {
      const dateStr = format(day, "yyyy-MM-dd");
      const dow = getDay(day); // 0=Sun, 6=Sat

      // Skip weekends for full-time hosts with 5-day schedule
      if (host.workingDays === 5 && (dow === 0 || dow === 6)) continue;

      const isOffDay = offDays.includes(dateStr);
      const existingSessions = host.sessions.filter(
        (s) => format(new Date(s.scheduledStart), "yyyy-MM-dd") === dateStr
      );
      const hasExistingSession = existingSessions.length > 0;

      // Filter by brand if requested
      if (filterBrandId && preferredBrands.length > 0 && !preferredBrands.includes(filterBrandId)) {
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
      });
    }
  }

  // Sort by date, then by host name
  suggestions.sort((a, b) => a.date.localeCompare(b.date) || a.hostName.localeCompare(b.hostName));

  // Summary stats
  const available = suggestions.filter((s) => !s.isOffDay && !s.hasExistingSession);
  const conflicts = suggestions.filter((s) => s.hasExistingSession);
  const offDaySuggestions = suggestions.filter((s) => s.isOffDay);

  return Response.json({
    month, year, totalDays: allDays.length,
    suggestions: available.slice(0, 200), // cap at 200 for performance
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
