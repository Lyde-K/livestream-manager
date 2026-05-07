import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";

// ── Period helpers ────────────────────────────────────────────────────────────

function getPeriodBounds(period: string, month: number, year: number) {
  switch (period) {
    case "quarter": {
      const q = Math.floor(month / 3);
      const thisStart = new Date(year, q * 3, 1);
      const thisEnd   = endOfMonth(new Date(year, q * 3 + 2, 1));
      const prevQ     = q === 0 ? 3 : q - 1;
      const prevYear  = q === 0 ? year - 1 : year;
      const prevStart = new Date(prevYear, prevQ * 3, 1);
      const prevEnd   = endOfMonth(new Date(prevYear, prevQ * 3 + 2, 1));
      return { thisStart, thisEnd, prevStart, prevEnd,
        label: `Q${q + 1} ${year}`, prevLabel: `Q${prevQ + 1} ${prevYear}` };
    }
    case "halfyear": {
      const h = month < 6 ? 0 : 1;
      const thisStart = new Date(year, h * 6, 1);
      const thisEnd   = endOfMonth(new Date(year, h * 6 + 5, 1));
      const prevStart = h === 0 ? new Date(year - 1, 6, 1)  : new Date(year, 0, 1);
      const prevEnd   = h === 0 ? endOfMonth(new Date(year - 1, 11, 1)) : endOfMonth(new Date(year, 5, 1));
      return { thisStart, thisEnd, prevStart, prevEnd,
        label: `H${h + 1} ${year}`, prevLabel: h === 0 ? `H2 ${year - 1}` : `H1 ${year}` };
    }
    case "year": {
      const thisStart = new Date(year, 0, 1);
      const thisEnd   = new Date(year, 11, 31, 23, 59, 59, 999);
      const prevStart = new Date(year - 1, 0, 1);
      const prevEnd   = new Date(year - 1, 11, 31, 23, 59, 59, 999);
      return { thisStart, thisEnd, prevStart, prevEnd,
        label: String(year), prevLabel: String(year - 1) };
    }
    default: { // month
      const anchor    = new Date(year, month, 1);
      const prevAnchor = subMonths(anchor, 1);
      return {
        thisStart: startOfMonth(anchor), thisEnd: endOfMonth(anchor),
        prevStart: startOfMonth(prevAnchor), prevEnd: endOfMonth(prevAnchor),
        label: format(anchor, "MMMM yyyy"), prevLabel: format(prevAnchor, "MMMM yyyy"),
      };
    }
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || !["ADMIN"].includes((session.user as { role: string }).role))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") ?? "month";
  const month  = parseInt(searchParams.get("month") ?? String(new Date().getMonth()));
  const year   = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()));

  const { thisStart, thisEnd, prevStart, prevEnd, label, prevLabel } =
    getPeriodBounds(period, month, year);

  const [thisSessions, prevSessions, allHosts] = await Promise.all([
    prisma.session.findMany({
      where: { scheduledStart: { gte: thisStart, lte: thisEnd } },
      select: { liveHostId: true, status: true, punctuality: true, gmv: true, actualDurationMinutes: true },
    }),
    prisma.session.findMany({
      where: { scheduledStart: { gte: prevStart, lte: prevEnd } },
      select: { liveHostId: true, status: true, punctuality: true, gmv: true, actualDurationMinutes: true },
    }),
    prisma.liveHost.findMany({ select: { id: true, displayName: true, type: true } }),
  ]);

  // ── Aggregate per host ───────────────────────────────────────────────────
  function agg(sessions: typeof thisSessions, hostId: string) {
    const hs        = sessions.filter(s => s.liveHostId === hostId);
    const completed = hs.filter(s => s.status === "COMPLETED");
    const missed    = hs.filter(s => s.status === "MISSED");
    const finished  = completed.length + missed.length;
    const completionRate = finished > 0 ? (completed.length / finished) * 100 : null;

    const timed      = completed.filter(s => s.punctuality !== null);
    const onTimeCnt  = timed.filter(s => s.punctuality === "EARLY" || s.punctuality === "ON_TIME").length;
    const onTimeRate = timed.length > 0 ? (onTimeCnt / timed.length) * 100 : null;

    const totalGMV     = completed.reduce((s, x) => s + (x.gmv ?? 0), 0);
    const totalMinutes = completed.reduce((s, x) => s + (x.actualDurationMinutes ?? 0), 0);
    const gmvPerHour   = totalMinutes > 0 ? (totalGMV / totalMinutes) * 60 : null;

    return { completionRate, onTimeRate, gmvPerHour, sessionCount: hs.length, completedCount: completed.length };
  }

  const hostIds = [...new Set([
    ...thisSessions.filter(s => s.liveHostId != null).map(s => s.liveHostId!),
    ...prevSessions.filter(s => s.liveHostId != null).map(s => s.liveHostId!),
  ])];

  const baseStats = hostIds.map(hostId => {
    const host = allHosts.find(h => h.id === hostId);
    if (!host) return null;
    const curr = agg(thisSessions, hostId);
    const prev = agg(prevSessions, hostId);
    const gmvHourGrowth = curr.gmvPerHour !== null && prev.gmvPerHour !== null && prev.gmvPerHour > 0
      ? ((curr.gmvPerHour - prev.gmvPerHour) / prev.gmvPerHour) * 100
      : null;
    // Consistency score: 50% completion + 50% on-time (use full completion weight if on-time is null)
    const consistencyScore = curr.completionRate !== null
      ? curr.onTimeRate !== null
        ? curr.completionRate * 0.5 + curr.onTimeRate * 0.5
        : curr.completionRate
      : null;
    return {
      hostId, displayName: host.displayName, type: host.type,
      ...curr, prevGmvPerHour: prev.gmvPerHour, gmvHourGrowth, consistencyScore,
    };
  }).filter(Boolean) as NonNullable<ReturnType<typeof agg> & {
    hostId: string; displayName: string; type: string;
    prevGmvPerHour: number | null; gmvHourGrowth: number | null; consistencyScore: number | null;
  }>[];

  // Only include hosts active in this period
  const active = baseStats.filter(h => h.sessionCount > 0);

  // ── Performance ranking: sort by GMV/hr growth descending ────────────────
  const performance = [...active]
    .sort((a, b) => {
      if (a.gmvHourGrowth === null && b.gmvHourGrowth === null) return 0;
      if (a.gmvHourGrowth === null) return 1;
      if (b.gmvHourGrowth === null) return -1;
      return b.gmvHourGrowth - a.gmvHourGrowth;
    })
    .map((h, i, arr) => {
      let rank = i + 1;
      // Tie: same rank for same gmvHourGrowth
      if (i > 0 && h.gmvHourGrowth !== null && h.gmvHourGrowth === arr[i - 1].gmvHourGrowth) {
        rank = (arr[i - 1] as any).rank;
      }
      return { ...h, rank };
    });

  // ── Consistency ranking: sort by consistency score descending ────────────
  const consistency = [...active]
    .sort((a, b) => {
      if (a.consistencyScore === null && b.consistencyScore === null) return 0;
      if (a.consistencyScore === null) return 1;
      if (b.consistencyScore === null) return -1;
      return b.consistencyScore - a.consistencyScore;
    })
    .map((h, i, arr) => {
      let rank = i + 1;
      if (i > 0 && h.consistencyScore !== null && h.consistencyScore === arr[i - 1].consistencyScore) {
        rank = (arr[i - 1] as any).rank;
      }
      return { ...h, rank };
    });

  return Response.json({ label, prevLabel, performance, consistency }, {
    headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
  });
}
