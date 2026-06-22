import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAffiliateScope, assertBrandAccess } from "@/lib/affiliate/scope";
import { cachedJson } from "@/lib/affiliate/cache";

interface PeriodSnapshot {
  period: string;
  gmv: number;
  estCommission: number;
  videos: number;
  liveStreams: number;
  creators: number;
  blacklisted: number;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  const scope = await getAffiliateScope(user);
  if (scope.brandIds.length === 0) {
    return Response.json({
      snapshots: [], topCreators: [], topProducts: [], topLiveCreators: [],
      topVideoCreators: [], labelDistribution: {}, prevLabelDistribution: {},
      brandIds: [], periods: [], rangeMode: false, rangeSnapshot: null, rangePeriods: [],
    });
  }

  const sp = req.nextUrl.searchParams;
  const brandId = sp.get("brandId");
  const periodParam = sp.get("period");   // "2026-04" | "YTD" | null
  const fromParam = sp.get("from");       // "2026-01"  (range mode)
  const toParam = sp.get("to");           // "2026-04"  (range mode)
  const affiliateType = sp.get("type") as "all" | "live" | "video" | null; // creator type filter

  if (brandId && !assertBrandAccess(scope, brandId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const brandFilter = brandId ?? { in: scope.brandIds };

  // Type filter: only include creators who have at least one live/video in that period
  const typeFilter = affiliateType === "live"
    ? { liveStreams: { gt: 0 } }
    : affiliateType === "video"
    ? { videos: { gt: 0 } }
    : {};

  // ── Always fetch monthly snapshots for trend table ───────────────────────────
  const [grouped, blacklistGrouped] = await Promise.all([
    prisma.affiliateCreatorStat.groupBy({
      by: ["period"],
      where: { brandId: brandFilter, ...typeFilter },
      _sum: { gmv: true, estCommission: true, videos: true, liveStreams: true },
      _count: { _all: true },
      orderBy: { period: "asc" },
    }),
    prisma.affiliateCreatorStat.groupBy({
      by: ["period"],
      where: { brandId: brandFilter, label: "F", ...typeFilter },
      _count: { _all: true },
    }),
  ]);

  const blMap = new Map<string, number>();
  for (const b of blacklistGrouped) blMap.set(b.period, b._count._all);

  const snapshots: PeriodSnapshot[] = grouped.map((g) => ({
    period: g.period,
    gmv: Number(g._sum.gmv ?? 0),
    estCommission: Number(g._sum.estCommission ?? 0),
    videos: g._sum.videos ?? 0,
    liveStreams: g._sum.liveStreams ?? 0,
    creators: g._count._all,
    blacklisted: blMap.get(g.period) ?? 0,
  }));

  const periods = snapshots.map((s) => s.period);
  const defaultPeriod = periods.length > 0 ? periods[periods.length - 1] : null;

  // ── Determine mode ───────────────────────────────────────────────────────────
  let rangeMode = false;
  let rangePeriods: string[] = [];
  let activePeriod: string | null = null;

  if (periodParam === "YTD") {
    const latestPeriod = periods.length > 0 ? periods[periods.length - 1] : null;
    if (latestPeriod) {
      const ytdYear = latestPeriod.substring(0, 4);
      rangePeriods = periods.filter((p) => p.startsWith(`${ytdYear}-`));
      activePeriod = "YTD";
      rangeMode = true;
    }
  } else if (fromParam && toParam && fromParam <= toParam) {
    rangePeriods = periods.filter((p) => p >= fromParam && p <= toParam);
    activePeriod = `${fromParam}..${toParam}`;
    rangeMode = true;
  } else {
    activePeriod = periodParam && periods.includes(periodParam) ? periodParam : defaultPeriod;
  }

  // ── Range mode: aggregate in PostgreSQL, not in-process ─────────────────────
  if (rangeMode && rangePeriods.length > 0) {
    const latestInRange = rangePeriods[rangePeriods.length - 1];

    // All aggregation done by the DB — one row per unique creator/product returned
    const [creatorGrouped, productGrouped, latestCreatorRows, latestProductRows, labelDist] = await Promise.all([
      prisma.affiliateCreatorStat.groupBy({
        by: ["creatorName", "brandId"],
        where: { brandId: brandFilter, period: { in: rangePeriods }, ...typeFilter },
        _sum: { gmv: true, estCommission: true, videos: true, liveStreams: true, samplesShipped: true },
      }),
      prisma.affiliateProductStat.groupBy({
        by: ["productId", "productName", "brandId"],
        where: { brandId: brandFilter, period: { in: rangePeriods } },
        _sum: { gmv: true },
      }),
      // Labels and ids from the most recent period in range
      prisma.affiliateCreatorStat.findMany({
        where: { brandId: brandFilter, period: latestInRange },
        select: { id: true, creatorName: true, brandId: true, label: true },
      }),
      prisma.affiliateProductStat.findMany({
        where: { brandId: brandFilter, period: latestInRange },
        select: { id: true, productId: true, brandId: true, tier: true },
      }),
      prisma.affiliateCreatorStat.groupBy({
        by: ["label"],
        where: { brandId: brandFilter, period: latestInRange },
        _count: { _all: true },
      }),
    ]);

    // Fetch brand names once
    const allBrandIds = [...new Set([...creatorGrouped.map((c) => c.brandId), ...productGrouped.map((p) => p.brandId)])];
    const brands = await prisma.brand.findMany({
      where: { id: { in: allBrandIds } },
      select: { id: true, name: true },
    });
    const brandMap = new Map(brands.map((b) => [b.id, { name: b.name }]));

    const creatorLatestMap = new Map(latestCreatorRows.map((r) => [`${r.brandId}|${r.creatorName}`, r]));
    const productLatestMap = new Map(latestProductRows.map((r) => [`${r.brandId}|${r.productId}`, r]));

    const aggregatedCreators = creatorGrouped.map((c) => {
      const latest = creatorLatestMap.get(`${c.brandId}|${c.creatorName}`);
      return {
        id: latest?.id ?? c.creatorName,
        creatorName: c.creatorName,
        brandId: c.brandId,
        gmv: Number(c._sum.gmv ?? 0),
        estCommission: Number(c._sum.estCommission ?? 0),
        videos: c._sum.videos ?? 0,
        liveStreams: c._sum.liveStreams ?? 0,
        label: latest?.label ?? null,
        brand: brandMap.get(c.brandId) ?? { name: "" },
      };
    });

    const aggregatedProducts = productGrouped.map((p) => {
      const latest = productLatestMap.get(`${p.brandId}|${p.productId}`);
      return {
        id: latest?.id ?? p.productId,
        productId: p.productId,
        productName: p.productName,
        gmv: Number(p._sum.gmv ?? 0),
        tier: latest?.tier ?? null,
        brand: brandMap.get(p.brandId) ?? { name: "" },
      };
    });

    const labelDistribution: Record<string, number> = {};
    for (const d of labelDist) { if (d.label) labelDistribution[d.label] = d._count._all; }

    const rangeSnapshotParts = snapshots.filter((s) => rangePeriods.includes(s.period));
    const rangeSnapshot: PeriodSnapshot = {
      period: activePeriod!,
      gmv:           rangeSnapshotParts.reduce((acc, s) => acc + s.gmv, 0),
      estCommission: rangeSnapshotParts.reduce((acc, s) => acc + s.estCommission, 0),
      videos:        rangeSnapshotParts.reduce((acc, s) => acc + s.videos, 0),
      liveStreams:   rangeSnapshotParts.reduce((acc, s) => acc + s.liveStreams, 0),
      creators:      aggregatedCreators.length,
      blacklisted:   aggregatedCreators.filter((c) => c.label === "F").length,
    };

    return cachedJson({
      snapshots,
      periods,
      activePeriod,
      prevPeriod: null,
      rangeMode: true,
      rangeSnapshot,
      rangePeriods,
      topCreators: aggregatedCreators
        .sort((a, b) => b.gmv - a.gmv)
        .slice(0, 10)
        .map((c) => ({ id: c.id, creatorName: c.creatorName, gmv: c.gmv, prevGmv: null, roi: c.estCommission > 0 ? c.gmv / c.estCommission : null, label: c.label, brand: c.brand })),
      topProducts: aggregatedProducts
        .sort((a, b) => b.gmv - a.gmv)
        .slice(0, 10)
        .map((p) => ({ id: p.id, productName: p.productName, gmv: p.gmv, prevGmv: null, tier: p.tier, brand: p.brand })),
      topLiveCreators: [...aggregatedCreators]
        .filter((c) => c.liveStreams > 0)
        .sort((a, b) => b.liveStreams - a.liveStreams)
        .slice(0, 10)
        .map((c) => ({ id: c.id, creatorName: c.creatorName, liveStreams: c.liveStreams, gmv: c.gmv, label: c.label, brand: c.brand })),
      topVideoCreators: [...aggregatedCreators]
        .filter((c) => c.videos > 0)
        .sort((a, b) => b.videos - a.videos)
        .slice(0, 10)
        .map((c) => ({ id: c.id, creatorName: c.creatorName, videos: c.videos, gmv: c.gmv, label: c.label, brand: c.brand })),
      labelDistribution,
      prevLabelDistribution: {},
      brandIds: scope.brandIds,
    });
  }

  // ── Single-period mode (existing logic) ──────────────────────────────────────
  const activePeriodIdx = activePeriod ? periods.indexOf(activePeriod) : -1;
  const prevPeriod = activePeriodIdx > 0 ? periods[activePeriodIdx - 1] : null;

  const [topCreators, topProducts, topLiveCreators, topVideoCreators, labelDist, prevLabelDist] = activePeriod
    ? await Promise.all([
        prisma.affiliateCreatorStat.findMany({
          where: { brandId: brandFilter, period: activePeriod, ...typeFilter },
          orderBy: { gmv: "desc" }, take: 10,
          include: { brand: { select: { name: true } } },
        }),
        prisma.affiliateProductStat.findMany({
          where: { brandId: brandFilter, period: activePeriod },
          orderBy: { gmv: "desc" }, take: 10,
          include: { brand: { select: { name: true } } },
        }),
        prisma.affiliateCreatorStat.findMany({
          where: { brandId: brandFilter, period: activePeriod, liveStreams: { gt: 0 } },
          orderBy: { liveStreams: "desc" }, take: 10,
          include: { brand: { select: { name: true } } },
        }),
        prisma.affiliateCreatorStat.findMany({
          where: { brandId: brandFilter, period: activePeriod, videos: { gt: 0 } },
          orderBy: { videos: "desc" }, take: 10,
          include: { brand: { select: { name: true } } },
        }),
        prisma.affiliateCreatorStat.groupBy({
          by: ["label"],
          where: { brandId: brandFilter, period: activePeriod, ...typeFilter },
          _count: { _all: true },
        }),
        prevPeriod
          ? prisma.affiliateCreatorStat.groupBy({
              by: ["label"],
              where: { brandId: brandFilter, period: prevPeriod, ...typeFilter },
              _count: { _all: true },
            })
          : Promise.resolve([]),
      ])
    : [[], [], [], [], [], []];

  const labelDistribution: Record<string, number> = {};
  for (const d of labelDist) { if (d.label) labelDistribution[d.label] = d._count._all; }
  const prevLabelDistribution: Record<string, number> = {};
  for (const d of prevLabelDist) { if (d.label) prevLabelDistribution[d.label] = d._count._all; }

  const prevCreatorMap = new Map<string, number>();
  const prevProductMap = new Map<string, number>();
  if (prevPeriod && (topCreators.length > 0 || topProducts.length > 0)) {
    const [prevCreatorStats, prevProductStats] = await Promise.all([
      topCreators.length > 0
        ? prisma.affiliateCreatorStat.findMany({
            where: { brandId: brandFilter, period: prevPeriod, creatorName: { in: topCreators.map((c) => c.creatorName) } },
            select: { creatorName: true, brandId: true, gmv: true },
          })
        : Promise.resolve([]),
      topProducts.length > 0
        ? prisma.affiliateProductStat.findMany({
            where: { brandId: brandFilter, period: prevPeriod, productId: { in: topProducts.map((p) => p.productId) } },
            select: { productId: true, brandId: true, gmv: true },
          })
        : Promise.resolve([]),
    ]);
    for (const pc of prevCreatorStats) prevCreatorMap.set(`${pc.creatorName}|${pc.brandId}`, Number(pc.gmv));
    for (const pp of prevProductStats) prevProductMap.set(`${pp.productId}|${pp.brandId}`, Number(pp.gmv));
  }

  return cachedJson({
    snapshots,
    periods,
    activePeriod,
    prevPeriod,
    rangeMode: false,
    rangeSnapshot: null,
    rangePeriods: [],
    topCreators: topCreators.map((c) => ({
      id: c.id, creatorName: c.creatorName, gmv: Number(c.gmv),
      prevGmv: prevCreatorMap.get(`${c.creatorName}|${c.brandId}`) ?? null,
      roi: c.roi == null ? null : Number(c.roi),
      label: c.label, brand: c.brand,
    })),
    topProducts: topProducts.map((p) => ({
      id: p.id, productName: p.productName, gmv: Number(p.gmv),
      prevGmv: prevProductMap.get(`${p.productId}|${p.brandId}`) ?? null,
      tier: p.tier, brand: p.brand,
    })),
    topLiveCreators: topLiveCreators.map((c) => ({
      id: c.id, creatorName: c.creatorName, liveStreams: c.liveStreams, gmv: Number(c.gmv),
      label: c.label, brand: c.brand,
    })),
    topVideoCreators: topVideoCreators.map((c) => ({
      id: c.id, creatorName: c.creatorName, videos: c.videos, gmv: Number(c.gmv),
      label: c.label, brand: c.brand,
    })),
    labelDistribution,
    prevLabelDistribution,
    brandIds: scope.brandIds,
  });
}
