import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAffiliateScope, assertBrandAccess } from "@/lib/affiliate/scope";

const SORT_FIELDS = new Set(["gmv", "roi", "itemsSold", "videos", "liveStreams", "estCommission"]);

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  const scope = await getAffiliateScope(user);
  if (scope.brandIds.length === 0) return Response.json({ rows: [], total: 0 });

  const sp = req.nextUrl.searchParams;
  const brandId = sp.get("brandId");
  const period = sp.get("period");
  const search = (sp.get("search") ?? "").trim();
  const tier = sp.get("tier");
  const category = sp.get("category");
  const prevPeriod = sp.get("prevPeriod");
  const sortBy = sp.get("sortBy") ?? "gmv";
  const sortDir = sp.get("sortDir") === "asc" ? "asc" : "desc";
  const PAGE_SIZE = 200;
  const skip = Math.max(0, parseInt(sp.get("skip") ?? "0", 10));
  const take = Math.min(PAGE_SIZE, Math.max(1, parseInt(sp.get("limit") ?? String(PAGE_SIZE), 10)));

  if (!period) return Response.json({ error: "period is required" }, { status: 400 });
  if (brandId && !assertBrandAccess(scope, brandId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!SORT_FIELDS.has(sortBy)) {
    return Response.json({ error: `invalid sortBy: ${sortBy}` }, { status: 400 });
  }

  const brandFilter = brandId ?? { in: scope.brandIds };

  // ── YTD aggregation mode ─────────────────────────────────────────────────────
  if (period === "YTD") {
    const latest = await prisma.affiliateProductStat.findFirst({
      where: { brandId: brandFilter },
      orderBy: { period: "desc" },
      select: { period: true },
    });
    if (!latest) return Response.json({ rows: [], categories: [] });

    const ytdYear = latest.period.substring(0, 4);

    const groupByWhere: {
      brandId: string | { in: string[] };
      period: { startsWith: string };
      productName?: { contains: string; mode: "insensitive" };
      tier?: string;
      category?: string;
    } = { brandId: brandFilter, period: { startsWith: `${ytdYear}-` } };
    if (search) groupByWhere.productName = { contains: search, mode: "insensitive" };
    if (tier) groupByWhere.tier = tier;
    if (category) groupByWhere.category = category;

    const [grouped, latestRows, catRows] = await Promise.all([
      prisma.affiliateProductStat.groupBy({
        by: ["productId", "productName", "brandId"],
        where: groupByWhere,
        _sum: { gmv: true, estCommission: true, itemsSold: true, videos: true, liveStreams: true, samplesShipped: true },
      }),
      prisma.affiliateProductStat.findMany({
        where: { brandId: brandFilter, period: latest.period },
        include: { brand: { select: { id: true, name: true, color: true } } },
      }),
      prisma.affiliateProductStat.findMany({
        where: { brandId: brandFilter, period: latest.period },
        select: { category: true },
        distinct: ["category"],
      }),
    ]);

    const latestMap = new Map(latestRows.map((r) => [`${r.brandId}|${r.productId}`, r]));

    let results = grouped.map((g) => {
      const latest = latestMap.get(`${g.brandId}|${g.productId}`);
      const gmv = Number(g._sum.gmv ?? 0);
      const estCommission = Number(g._sum.estCommission ?? 0);
      return {
        id: latest?.id ?? `${g.brandId}|${g.productId}`,
        productId: g.productId,
        productName: g.productName,
        category: latest?.category ?? null,
        gmv, estCommission,
        prevGmv: null as number | null,
        itemsSold: g._sum.itemsSold ?? 0,
        videos: g._sum.videos ?? 0,
        liveStreams: g._sum.liveStreams ?? 0,
        samplesShipped: g._sum.samplesShipped ?? 0,
        roi: estCommission > 0 ? gmv / estCommission : null,
        tier: latest?.tier ?? null,
        brand: latest?.brand ?? { id: g.brandId, name: "", color: "" },
      };
    });

    results.sort((a, b) => {
      const av = ((a as unknown as Record<string, number>)[sortBy]) ?? 0;
      const bv = ((b as unknown as Record<string, number>)[sortBy]) ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });

    const aggregateTotals = {
      totalGmv:          results.reduce((s, r) => s + r.gmv, 0),
      totalCommission:   results.reduce((s, r) => s + r.estCommission, 0),
      totalItemsSold:    results.reduce((s, r) => s + r.itemsSold, 0),
      totalLiveStreams:  results.reduce((s, r) => s + r.liveStreams, 0),
      totalSamples:      results.reduce((s, r) => s + r.samplesShipped, 0),
    };

    return Response.json({
      rows: results.slice(skip, skip + take),
      total: results.length,
      categories: catRows.map((c) => c.category).filter((c): c is string => !!c).sort(),
      aggregateTotals,
    });
  }

  // ── Single-period mode ───────────────────────────────────────────────────────
  const where: {
    brandId: string | { in: string[] };
    period: string;
    productName?: { contains: string; mode: "insensitive" };
    tier?: string;
    category?: string;
  } = {
    brandId: brandFilter,
    period,
  };
  if (search) where.productName = { contains: search, mode: "insensitive" };
  if (tier) where.tier = tier;
  if (category) where.category = category;

  const [rows, total, categories, totalsAgg] = await Promise.all([
    prisma.affiliateProductStat.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      take,
      skip,
      include: { brand: { select: { id: true, name: true, color: true } } },
    }),
    prisma.affiliateProductStat.count({ where }),
    prisma.affiliateProductStat.findMany({
      where: { brandId: brandFilter, period },
      select: { category: true },
      distinct: ["category"],
    }),
    prisma.affiliateProductStat.aggregate({
      where,
      _sum: { gmv: true, estCommission: true, itemsSold: true, liveStreams: true, samplesShipped: true },
    }),
  ]);

  // Fetch prev-period GMV for MoM delta
  const prevGmvMap = new Map<string, number>();
  if (prevPeriod && rows.length > 0) {
    const prevRows = await prisma.affiliateProductStat.findMany({
      where: {
        brandId: brandFilter,
        period: prevPeriod,
        productId: { in: rows.map((r) => r.productId) },
      },
      select: { productId: true, brandId: true, gmv: true },
    });
    for (const pr of prevRows) prevGmvMap.set(`${pr.productId}|${pr.brandId}`, Number(pr.gmv));
  }

  const aggregateTotals = {
    totalGmv:         Number(totalsAgg._sum.gmv ?? 0),
    totalCommission:  Number(totalsAgg._sum.estCommission ?? 0),
    totalItemsSold:   totalsAgg._sum.itemsSold ?? 0,
    totalLiveStreams:  totalsAgg._sum.liveStreams ?? 0,
    totalSamples:     totalsAgg._sum.samplesShipped ?? 0,
  };

  return Response.json({
    aggregateTotals,
    total,
    rows: rows.map((p) => ({
      id: p.id,
      productId: p.productId,
      productName: p.productName,
      category: p.category,
      gmv: Number(p.gmv),
      prevGmv: prevGmvMap.get(`${p.productId}|${p.brandId}`) ?? null,
      refunds: Number(p.refunds),
      itemsSold: p.itemsSold,
      attributedOrders: p.attributedOrders,
      videos: p.videos,
      liveStreams: p.liveStreams,
      estCommission: Number(p.estCommission),
      samplesShipped: p.samplesShipped,
      roi: p.roi == null ? null : Number(p.roi),
      tier: p.tier,
      brand: p.brand,
    })),
    categories: categories.map((c) => c.category).filter((c): c is string => !!c).sort(),
  });
}
