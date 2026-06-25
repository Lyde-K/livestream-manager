import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toMytDateStr } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { role: string };
  if (user.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const sessionType = searchParams.get("type"); // "BAU" | "CAMPAIGN" | null (all)
  if (!start || !end) return Response.json({ error: "start and end required" }, { status: 400 });

  const startDate = new Date(start + "T00:00:00+08:00");
  const endDate = new Date(end + "T23:59:59+08:00");

  const campaignFilter =
    sessionType === "BAU" ? { isCampaignDay: false } :
    sessionType === "CAMPAIGN" ? { isCampaignDay: true } :
    {};

  const sessions = await prisma.session.findMany({
    where: {
      status: "COMPLETED",
      scheduledStart: { gte: startDate, lte: endDate },
      ...campaignFilter,
    },
    include: {
      brand: true,
      liveHost: { include: { user: true } },
    },
    orderBy: { scheduledStart: "asc" },
  });

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalGMV = sessions.reduce((s, x) => s + (x.gmv ?? 0), 0);
  const totalViewers = sessions.reduce((s, x) => s + (x.viewers ?? 0), 0);
  const totalOrders = sessions.reduce((s, x) => s + (x.ordersConfirmed ?? 0), 0);
  const ctorSessions = sessions.filter((x) => x.ctor != null);
  const avgCTOR = ctorSessions.length > 0
    ? ctorSessions.reduce((s, x) => s + (x.ctor ?? 0), 0) / ctorSessions.length
    : null;

  // ── By date (YYYY-MM-DD) ──────────────────────────────────────────────────
  const byDateMap = new Map<string, { gmv: number; viewers: number; sessions: number; orders: number }>();
  for (const s of sessions) {
    const key = toMytDateStr(s.scheduledStart);
    const cur = byDateMap.get(key) ?? { gmv: 0, viewers: 0, sessions: 0, orders: 0 };
    byDateMap.set(key, {
      gmv: cur.gmv + (s.gmv ?? 0),
      viewers: cur.viewers + (s.viewers ?? 0),
      sessions: cur.sessions + 1,
      orders: cur.orders + (s.ordersConfirmed ?? 0),
    });
  }
  const byDate = Array.from(byDateMap.entries()).map(([date, v]) => ({ date, ...v }));

  // ── By brand ─────────────────────────────────────────────────────────────
  const byBrandMap = new Map<string, {
    brandId: string; brandName: string; platform: string; color: string;
    gmv: number; viewers: number; sessions: number; orders: number;
    ctorSum: number; ctorCount: number;
  }>();
  for (const s of sessions) {
    const key = s.brandId;
    const cur = byBrandMap.get(key) ?? {
      brandId: s.brandId, brandName: s.brand.name, platform: s.brand.platform,
      color: s.brand.color, gmv: 0, viewers: 0, sessions: 0, orders: 0, ctorSum: 0, ctorCount: 0,
    };
    byBrandMap.set(key, {
      ...cur,
      gmv: cur.gmv + (s.gmv ?? 0),
      viewers: cur.viewers + (s.viewers ?? 0),
      sessions: cur.sessions + 1,
      orders: cur.orders + (s.ordersConfirmed ?? 0),
      ctorSum: cur.ctorSum + (s.ctor ?? 0),
      ctorCount: cur.ctorCount + (s.ctor != null ? 1 : 0),
    });
  }
  const byBrand = Array.from(byBrandMap.values())
    .map((b) => ({ ...b, avgCTOR: b.ctorCount > 0 ? b.ctorSum / b.ctorCount : null }))
    .sort((a, b) => b.gmv - a.gmv);

  // ── By host (only sessions with an assigned host) ────────────────────────
  const byHostMap = new Map<string, {
    hostId: string; hostName: string; displayName: string; type: string;
    gmv: number; viewers: number; sessions: number; hours: number;
  }>();
  for (const s of sessions.filter(s => s.liveHostId != null)) {
    const key = s.liveHostId!;
    const cur = byHostMap.get(key) ?? {
      hostId: s.liveHostId!,
      hostName: s.liveHost?.user.name ?? "Unassigned",
      displayName: s.liveHost?.displayName ?? "—",
      type: s.liveHost?.type ?? "—",
      gmv: 0, viewers: 0, sessions: 0, hours: 0,
    };
    byHostMap.set(key, {
      ...cur,
      gmv: cur.gmv + (s.gmv ?? 0),
      viewers: cur.viewers + (s.viewers ?? 0),
      sessions: cur.sessions + 1,
      hours: cur.hours + (s.actualDurationMinutes ?? 0) / 60,
    });
  }
  const byHost = Array.from(byHostMap.values()).sort((a, b) => b.gmv - a.gmv);

  // ── By platform ───────────────────────────────────────────────────────────
  const platforms = ["TIKTOK", "SHOPEE"];
  const byPlatform = platforms.map((p) => {
    const ps = sessions.filter((s) => s.platform.toUpperCase() === p);
    return {
      platform: p,
      gmv: ps.reduce((s, x) => s + (x.gmv ?? 0), 0),
      sessions: ps.length,
      viewers: ps.reduce((s, x) => s + (x.viewers ?? 0), 0),
    };
  });

  // ── By country (MY / SG derived from brand name) ──────────────────────────
  const countryMap = new Map<string, { country: string; gmv: number; sessions: number; viewers: number }>();
  for (const s of sessions) {
    const c = /\bSG\b/.test(s.brand.name) ? "SG" : /\bMY\b/.test(s.brand.name) ? "MY" : "Other";
    const cur = countryMap.get(c) ?? { country: c, gmv: 0, sessions: 0, viewers: 0 };
    countryMap.set(c, {
      ...cur,
      gmv: cur.gmv + (s.gmv ?? 0),
      sessions: cur.sessions + 1,
      viewers: cur.viewers + (s.viewers ?? 0),
    });
  }
  const byCountry = Array.from(countryMap.values()).sort((a, b) => b.gmv - a.gmv);

  // ── BAU / Campaign breakdown ──────────────────────────────────────────────
  const bauSessions = sessions.filter(s => !s.isCampaignDay);
  const campaignSessions = sessions.filter(s => s.isCampaignDay);
  const byType = {
    bau: { sessions: bauSessions.length, gmv: bauSessions.reduce((s, x) => s + (x.gmv ?? 0), 0) },
    campaign: { sessions: campaignSessions.length, gmv: campaignSessions.reduce((s, x) => s + (x.gmv ?? 0), 0) },
  };

  return Response.json({
    totalGMV, totalViewers, totalOrders, avgCTOR,
    sessionCount: sessions.length,
    byDate, byBrand, byHost, byPlatform, byCountry, byType,
  });
}
