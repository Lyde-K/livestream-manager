export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateBrandReport, ReportInput } from "@/lib/report/brand-report";
import { mytMonthRange } from "@/lib/utils";
import { format } from "date-fns";

const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    brandId: string;
    month: number;
    year: number;
    notes: ReportInput["notes"];
  };

  const { brandId, month, year, notes } = body;

  if (!brandId || !month || !year)
    return Response.json({ error: "brandId, month, year required" }, { status: 400 });

  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) return Response.json({ error: "Brand not found" }, { status: 404 });

  const { start: curStart, end: curEnd } = mytMonthRange(month, year);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;
  const { start: prevStart, end: prevEnd } = mytMonthRange(prevMonth, prevYear);

  const [curSessions, prevSessions] = await Promise.all([
    prisma.session.findMany({
      where: { brandId, status: "COMPLETED", scheduledStart: { gte: curStart, lte: curEnd } },
      include: { liveHost: { include: { user: true } } },
      orderBy: { scheduledStart: "asc" },
    }),
    prisma.session.findMany({
      where: { brandId, status: "COMPLETED", scheduledStart: { gte: prevStart, lte: prevEnd } },
      select: { gmv: true, isCampaignDay: true, actualDurationMinutes: true },
    }),
  ]);

  // Current aggregates
  const totalGMV   = curSessions.reduce((a, s) => a + (s.gmv ?? 0), 0);
  const totalHours = curSessions.reduce((a, s) => a + (s.actualDurationMinutes ?? 0) / 60, 0);
  const bauSess    = curSessions.filter(s => !s.isCampaignDay);
  const campSess   = curSessions.filter(s => s.isCampaignDay);
  const bauGMV     = bauSess.reduce((a, s) => a + (s.gmv ?? 0), 0);
  const bauHours   = bauSess.reduce((a, s) => a + (s.actualDurationMinutes ?? 0) / 60, 0);
  const campGMV    = campSess.reduce((a, s) => a + (s.gmv ?? 0), 0);
  const campHours  = campSess.reduce((a, s) => a + (s.actualDurationMinutes ?? 0) / 60, 0);
  const totalOrders   = curSessions.reduce((a, s) => a + ((s as any).orders ?? 0), 0);
  const totalViewers  = curSessions.reduce((a, s) => a + ((s as any).viewers ?? 0), 0);

  // Weekly GMV buckets
  const weekLabels: string[] = [];
  const weeklyGMV: number[] = [];
  for (let w = 0; w < 5; w++) {
    const wStart = new Date(curStart.getTime() + w * 7 * 86400000);
    const wEnd   = new Date(Math.min(wStart.getTime() + 7 * 86400000 - 1, curEnd.getTime()));
    const wGMV   = curSessions.filter(s => {
      const d = new Date(s.scheduledStart);
      return d >= wStart && d <= wEnd;
    }).reduce((a, s) => a + (s.gmv ?? 0), 0);
    if (wGMV > 0 || weeklyGMV.length > 0) {
      weekLabels.push(`W${w + 1}`);
      weeklyGMV.push(wGMV);
    }
  }
  if (weekLabels.length === 0) { weekLabels.push("W1"); weeklyGMV.push(0); }

  // Prev aggregates
  const prevTotalGMV  = prevSessions.reduce((a, s) => a + (s.gmv ?? 0), 0);
  const prevTotalHrs  = prevSessions.reduce((a, s) => a + (s.actualDurationMinutes ?? 0) / 60, 0);
  const prevBauGMV    = prevSessions.filter(s => !s.isCampaignDay).reduce((a, s) => a + (s.gmv ?? 0), 0);
  const prevBauHrs    = prevSessions.filter(s => !s.isCampaignDay).reduce((a, s) => a + (s.actualDurationMinutes ?? 0) / 60, 0);
  const prevCampGMV   = prevSessions.filter(s => s.isCampaignDay).reduce((a, s) => a + (s.gmv ?? 0), 0);
  const prevCampHrs   = prevSessions.filter(s => s.isCampaignDay).reduce((a, s) => a + (s.actualDurationMinutes ?? 0) / 60, 0);

  // Best / worst sessions
  const sortedByGMV = [...curSessions].sort((a, b) => (b.gmv ?? 0) - (a.gmv ?? 0));
  const best  = sortedByGMV[0];
  const worst = sortedByGMV[sortedByGMV.length - 1];

  function sessionToCard(s: typeof curSessions[0]) {
    const hours = (s.actualDurationMinutes ?? 0) / 60;
    return {
      date: format(new Date(s.scheduledStart), "d MMM yyyy"),
      hostName: s.liveHost?.displayName ?? s.liveHost?.user?.name ?? "—",
      gmv: s.gmv ?? 0,
      hours,
      gmvPerHour: hours > 0 ? (s.gmv ?? 0) / hours : 0,
      orders: (s as any).orders ?? 0,
      viewers: (s as any).viewers ?? 0,
      adsSpent: (s as any).adsCost ?? 0,
      type: s.isCampaignDay ? "Campaign" : "BAU",
      scheduledStart: s.scheduledStart.toISOString(),
      actualStart: s.actualStart ? s.actualStart.toISOString() : null,
      punctuality: s.punctuality ?? null,
    };
  }

  // Monthly averages (per session)
  const monthlyAvgGmv       = curSessions.length > 0 ? totalGMV / curSessions.length : 0;
  const monthlyAvgGmvPerHour = totalHours > 0 ? totalGMV / totalHours : 0;

  // Per-host breakdown
  const hostMap = new Map<string, { name: string; gmv: number; hours: number; sessions: number }>();
  for (const s of curSessions) {
    const hid  = s.liveHostId ?? "unknown";
    const name = s.liveHost?.displayName ?? s.liveHost?.user?.name ?? "—";
    const cur  = hostMap.get(hid) ?? { name, gmv: 0, hours: 0, sessions: 0 };
    cur.gmv     += s.gmv ?? 0;
    cur.hours   += (s.actualDurationMinutes ?? 0) / 60;
    cur.sessions += 1;
    hostMap.set(hid, cur);
  }
  const hosts = Array.from(hostMap.values()).map(h => ({
    ...h, gmvPerHour: h.hours > 0 ? h.gmv / h.hours : 0,
  })).sort((a, b) => b.gmv - a.gmv);

  const input: ReportInput = {
    brandId,
    brandName: brand.name,
    platform:  brand.platform ?? "TikTok",
    month, year,
    current: {
      totalGMV, totalHours, totalSessions: curSessions.length,
      totalOrders, totalViewers,
      bauGMV, bauHours, bauSessions: bauSess.length,
      campGMV, campHours, campSessions: campSess.length,
      weeklyGMV, weekLabels,
    },
    prev: {
      totalGMV: prevTotalGMV, totalHours: prevTotalHrs, totalSessions: prevSessions.length,
      bauGMV: prevBauGMV, bauHours: prevBauHrs,
      campGMV: prevCampGMV, campHours: prevCampHrs,
    },
    monthlyAvgGmv,
    monthlyAvgGmvPerHour,
    bestSession:  best  ? sessionToCard(best)  : { date:"—", hostName:"—", gmv:0, hours:0, gmvPerHour:0, orders:0, viewers:0, adsSpent:0, type:"BAU", scheduledStart: new Date().toISOString(), actualStart: null, punctuality: null },
    worstSession: worst ? sessionToCard(worst) : { date:"—", hostName:"—", gmv:0, hours:0, gmvPerHour:0, adsSpent:0, viewers:0, type:"BAU", scheduledStart: new Date().toISOString(), actualStart: null, punctuality: null },
    hosts,
    notes,
  };

  const pptxBuffer = await generateBrandReport(input);
  const monthLabel = MONTHS[month - 1];
  const filename   = `${brand.name.replace(/\s+/g, "_")}_Report_${monthLabel}_${year}.pptx`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Response(pptxBuffer as any, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
