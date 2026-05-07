import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAffiliateScope, assertBrandAccess } from "@/lib/affiliate/scope";

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
    return Response.json({ snapshots: [], topCreators: [], topProducts: [], topLiveCreators: [], topVideoCreators: [], labelDistribution: {}, prevLabelDistribution: {}, brandIds: [], periods: [] });
  }

  const sp = req.nextUrl.searchParams;
  const brandId = sp.get("brandId");
  const periodParam = sp.get("period");

  if (brandId && !assertBrandAccess(scope, brandId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const brandFilter = brandId ?? { in: scope.brandIds };

  const grouped = await prisma.affiliateCreatorStat.groupBy({
    by: ["period"],
    where: { brandId: brandFilter },
    _sum: { gmv: true, estCommission: true, videos: true, liveStreams: true },
    _count: { _all: true },
    orderBy: { period: "asc" },
  });

  const blacklistGrouped = await prisma.affiliateCreatorStat.groupBy({
    by: ["period"],
    where: { brandId: brandFilter, label: "F" },
    _count: { _all: true },
  });
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
  const activePeriod = periodParam && periods.includes(periodParam) ? periodParam : defaultPeriod;

  // The period immediately before activePeriod (for MoM label delta)
  const activePeriodIdx = activePeriod ? periods.indexOf(activePeriod) : -1;
  const prevPeriod = activePeriodIdx > 0 ? periods[activePeriodIdx - 1] : null;

  const [topCreators, topProducts, topLiveCreators, topVideoCreators, labelDist, prevLabelDist] = activePeriod
    ? await Promise.all([
        prisma.affiliateCreatorStat.findMany({
          where: { brandId: brandFilter, period: activePeriod },
          orderBy: { gmv: "desc" },
          take: 10,
          include: { brand: { select: { name: true } } },
        }),
        prisma.affiliateProductStat.findMany({
          where: { brandId: brandFilter, period: activePeriod },
          orderBy: { gmv: "desc" },
          take: 10,
          include: { brand: { select: { name: true } } },
        }),
        prisma.affiliateCreatorStat.findMany({
          where: { brandId: brandFilter, period: activePeriod, liveStreams: { gt: 0 } },
          orderBy: { liveStreams: "desc" },
          take: 10,
          include: { brand: { select: { name: true } } },
        }),
        prisma.affiliateCreatorStat.findMany({
          where: { brandId: brandFilter, period: activePeriod, videos: { gt: 0 } },
          orderBy: { videos: "desc" },
          take: 10,
          include: { brand: { select: { name: true } } },
        }),
        prisma.affiliateCreatorStat.groupBy({
          by: ["label"],
          where: { brandId: brandFilter, period: activePeriod },
          _count: { _all: true },
        }),
        prevPeriod
          ? prisma.affiliateCreatorStat.groupBy({
              by: ["label"],
              where: { brandId: brandFilter, period: prevPeriod },
              _count: { _all: true },
            })
          : Promise.resolve([]),
      ])
    : [[], [], [], [], [], []];

  const labelDistribution: Record<string, number> = {};
  for (const d of labelDist) {
    if (d.label) labelDistribution[d.label] = d._count._all;
  }

  const prevLabelDistribution: Record<string, number> = {};
  for (const d of prevLabelDist) {
    if (d.label) prevLabelDistribution[d.label] = d._count._all;
  }

  // Fetch prev-period GMV for top creators + top products (for MoM delta)
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

  return Response.json({
    snapshots,
    periods,
    activePeriod,
    prevPeriod,
    topCreators: topCreators.map((c) => ({
      id: c.id,
      creatorName: c.creatorName,
      gmv: Number(c.gmv),
      prevGmv: prevCreatorMap.get(`${c.creatorName}|${c.brandId}`) ?? null,
      roi: c.roi == null ? null : Number(c.roi),
      label: c.label,
      brand: c.brand,
    })),
    topProducts: topProducts.map((p) => ({
      id: p.id,
      productName: p.productName,
      gmv: Number(p.gmv),
      prevGmv: prevProductMap.get(`${p.productId}|${p.brandId}`) ?? null,
      tier: p.tier,
      brand: p.brand,
    })),
    topLiveCreators: topLiveCreators.map((c) => ({
      id: c.id,
      creatorName: c.creatorName,
      liveStreams: c.liveStreams,
      gmv: Number(c.gmv),
      label: c.label,
      brand: c.brand,
    })),
    topVideoCreators: topVideoCreators.map((c) => ({
      id: c.id,
      creatorName: c.creatorName,
      videos: c.videos,
      gmv: Number(c.gmv),
      label: c.label,
      brand: c.brand,
    })),
    labelDistribution,
    prevLabelDistribution,
    brandIds: scope.brandIds,
  });
}
