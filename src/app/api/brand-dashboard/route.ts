import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { subMonths, format } from "date-fns";
import { mytMonthRange } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const brandId  = searchParams.get("brandId");
  const monthRaw = searchParams.get("month");
  const yearRaw  = searchParams.get("year");

  if (!brandId || monthRaw === null || yearRaw === null) {
    return NextResponse.json({ success: false, error: "Missing params" }, { status: 400 });
  }

  const month = parseInt(monthRaw);
  const year  = parseInt(yearRaw);

  if (isNaN(month) || isNaN(year)) {
    return NextResponse.json({ success: false, error: "Invalid month/year" }, { status: 400 });
  }

  const { start: monthStart, end: monthEnd } = mytMonthRange(month, year);

  // ── 1. Top hosts for this brand this month ────────────────────────────────
  const completedWithHost = await prisma.session.findMany({
    where: {
      brandId,
      scheduledStart: { gte: monthStart, lte: monthEnd },
      status: "COMPLETED",
      liveHostId: { not: null },
    },
    include: {
      liveHost: { include: { user: { select: { name: true } } } },
    },
  });

  const hostMap = new Map<string, {
    name: string; sessions: number; gmv: number; hours: number; adsCost: number;
  }>();

  for (const s of completedWithHost) {
    if (!s.liveHostId || !s.liveHost) continue;
    const cur = hostMap.get(s.liveHostId) ?? {
      name: s.liveHost.displayName || s.liveHost.user.name,
      sessions: 0, gmv: 0, hours: 0, adsCost: 0,
    };
    hostMap.set(s.liveHostId, {
      ...cur,
      sessions: cur.sessions + 1,
      gmv:      cur.gmv      + (s.gmv               ?? 0),
      hours:    cur.hours    + (s.actualDurationMinutes ?? 0) / 60,
      adsCost:  cur.adsCost  + (s.adsCost            ?? 0),
    });
  }

  const topHosts = [...hostMap.values()]
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, 5)
    .map(h => ({ ...h, gmvPerHour: h.hours > 0 ? h.gmv / h.hours : 0 }));

  // ── 2. 6-month GMV trend ──────────────────────────────────────────────────
  const anchorDate = new Date(year, month - 1, 1);
  const trendMonthDates = Array.from({ length: 6 }, (_, i) => subMonths(anchorDate, 5 - i));

  const monthlyTrend = await Promise.all(
    trendMonthDates.map(async (d) => {
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      const { start, end } = mytMonthRange(m, y);
      const rows  = await prisma.session.findMany({
        where: { brandId, scheduledStart: { gte: start, lte: end }, status: "COMPLETED" },
        select: { gmv: true, actualDurationMinutes: true, adsCost: true },
      });
      const gmv      = rows.reduce((sum, s) => sum + (s.gmv               ?? 0), 0);
      const hours    = rows.reduce((sum, s) => sum + (s.actualDurationMinutes ?? 0) / 60, 0);
      const adsCost  = rows.reduce((sum, s) => sum + (s.adsCost            ?? 0), 0);
      return {
        month:    m - 1,
        year:     y,
        label:    format(d, "MMM"),
        gmv,
        hours,
        adsCost,
        sessions: rows.length,
      };
    })
  );

  // ── 3. Ads analysis — current month completed sessions ────────────────────
  const allCompleted = await prisma.session.findMany({
    where: {
      brandId,
      scheduledStart: { gte: monthStart, lte: monthEnd },
      status: "COMPLETED",
    },
    select: {
      id: true,
      scheduledStart: true,
      platform: true,
      gmv: true,
      adsCost: true,
      actualDurationMinutes: true,
      liveHost: {
        select: {
          displayName: true,
          user: { select: { name: true } },
        },
      },
    },
    orderBy: { scheduledStart: "asc" },
  });

  // Shopee livestream doesn't run ads — exclude from both ads-analysis lists
  const tiktokCompleted = allCompleted.filter(s => s.platform !== "SHOPEE");

  const noAdsSessions = tiktokCompleted
    .filter(s => (s.gmv ?? 0) > 0 && (s.adsCost === null || s.adsCost === 0))
    .map(s => ({
      id:       s.id,
      date:     s.scheduledStart.toISOString(),
      gmv:      s.gmv ?? 0,
      adsCost:  0,
      hostName: s.liveHost?.displayName || s.liveHost?.user.name || "Unassigned",
    }));

  const highAdsSessions = tiktokCompleted
    .filter(s => {
      const gmv = s.gmv ?? 0;
      const ads = s.adsCost ?? 0;
      return gmv > 0 && ads > 0 && ads / gmv > 0.4;
    })
    .map(s => ({
      id:       s.id,
      date:     s.scheduledStart.toISOString(),
      gmv:      s.gmv ?? 0,
      adsCost:  s.adsCost ?? 0,
      adsRatio: ((s.adsCost ?? 0) / (s.gmv ?? 1)) * 100,
      hostName: s.liveHost?.displayName || s.liveHost?.user.name || "Unassigned",
    }))
    .sort((a, b) => b.adsRatio - a.adsRatio);

  return NextResponse.json({
    success: true,
    data: { topHosts, monthlyTrend, noAdsSessions, highAdsSessions },
  });
}
