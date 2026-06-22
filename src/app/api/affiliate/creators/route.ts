import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAffiliateScope, assertBrandAccess } from "@/lib/affiliate/scope";

const SORT_FIELDS = new Set([
  "rank",
  "gmv",
  "roi",
  "videos",
  "liveStreams",
  "samplesShipped",
  "estCommission",
]);

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
  const label = sp.get("label");
  const sortBy = sp.get("sortBy") ?? "rank";
  const sortDir = sp.get("sortDir") === "desc" ? "desc" : "asc";
  const take = Math.min(parseInt(sp.get("limit") ?? "200", 10) || 200, 500);
  const skip = Math.max(parseInt(sp.get("skip") ?? "0", 10) || 0, 0);

  if (!period) return Response.json({ error: "period is required" }, { status: 400 });
  if (brandId && !assertBrandAccess(scope, brandId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!SORT_FIELDS.has(sortBy)) {
    return Response.json({ error: `invalid sortBy: ${sortBy}` }, { status: 400 });
  }

  const brandFilter = brandId ?? { in: scope.brandIds };

  // ── YTD aggregation — aggregated in PostgreSQL ──────────────────────────────
  if (period === "YTD") {
    const latest = await prisma.affiliateCreatorStat.findFirst({
      where: { brandId: brandFilter },
      orderBy: { period: "desc" },
      select: { period: true },
    });
    if (!latest) return Response.json({ rows: [], total: 0 });

    const ytdYear = latest.period.substring(0, 4);

    const groupByWhere: {
      brandId: string | { in: string[] };
      period: { startsWith: string };
      creatorName?: { contains: string; mode: "insensitive" };
    } = { brandId: brandFilter, period: { startsWith: `${ytdYear}-` } };
    if (search) groupByWhere.creatorName = { contains: search, mode: "insensitive" };

    const [grouped, latestRows] = await Promise.all([
      prisma.affiliateCreatorStat.groupBy({
        by: ["creatorName", "brandId"],
        where: groupByWhere,
        _sum: {
          gmv: true, estCommission: true, videos: true,
          liveStreams: true, samplesShipped: true, attributedOrders: true, refunds: true,
        },
      }),
      // Labels + ids from the most recent month only (small result set)
      prisma.affiliateCreatorStat.findMany({
        where: { brandId: brandFilter, period: latest.period },
        select: { id: true, creatorName: true, brandId: true, label: true },
      }),
    ]);

    const brandIds = [...new Set(grouped.map((g) => g.brandId))];
    const brands = await prisma.brand.findMany({
      where: { id: { in: brandIds } },
      select: { id: true, name: true, color: true },
    });
    const brandMap = new Map(brands.map((b) => [b.id, b]));
    const latestMap = new Map(latestRows.map((r) => [`${r.brandId}|${r.creatorName}`, r]));

    let results = grouped.map((g) => {
      const lbl = latestMap.get(`${g.brandId}|${g.creatorName}`);
      const brand = brandMap.get(g.brandId) ?? { id: g.brandId, name: "", color: "" };
      const gmv = Number(g._sum.gmv ?? 0);
      const estCommission = Number(g._sum.estCommission ?? 0);
      return {
        id: lbl?.id ?? `${g.brandId}|${g.creatorName}|ytd`,
        creatorName: g.creatorName,
        period: `${ytdYear} YTD`,
        rank: 0 as number | null,
        rankDelta: null as number | null,
        gmv,
        refunds: Number(g._sum.refunds ?? 0),
        attributedOrders: g._sum.attributedOrders ?? 0,
        itemsSold: 0,
        aov: 0,
        videos: g._sum.videos ?? 0,
        liveStreams: g._sum.liveStreams ?? 0,
        estCommission,
        samplesShipped: g._sum.samplesShipped ?? 0,
        roi: estCommission > 0 ? gmv / estCommission : null,
        label: lbl?.label ?? null,
        brand,
      };
    });

    if (label) results = results.filter((r) => r.label === label);

    const aggregateTotals = {
      totalGmv:         results.reduce((s, r) => s + r.gmv, 0),
      totalCommission:  results.reduce((s, r) => s + r.estCommission, 0),
      totalVideos:      results.reduce((s, r) => s + r.videos, 0),
      totalLiveStreams:  results.reduce((s, r) => s + r.liveStreams, 0),
    };

    const byGmv = [...results].sort((a, b) => b.gmv - a.gmv);
    const rankMap = new Map(byGmv.map((r, i) => [r.id, i + 1]));
    results = results.map((r) => ({ ...r, rank: rankMap.get(r.id) ?? null }));

    results.sort((a, b) => {
      let av = 0, bv = 0;
      if (sortBy === "rank")               { av = a.rank ?? 99999; bv = b.rank ?? 99999; }
      else if (sortBy === "gmv")           { av = a.gmv; bv = b.gmv; }
      else if (sortBy === "roi")           { av = a.roi ?? 0; bv = b.roi ?? 0; }
      else if (sortBy === "videos")        { av = a.videos; bv = b.videos; }
      else if (sortBy === "samplesShipped"){ av = a.samplesShipped; bv = b.samplesShipped; }
      else if (sortBy === "estCommission") { av = a.estCommission; bv = b.estCommission; }
      else if (sortBy === "liveStreams")   { av = a.liveStreams; bv = b.liveStreams; }
      return sortDir === "asc" ? av - bv : bv - av;
    });

    const total = results.length;
    return Response.json({ rows: results.slice(skip, skip + take), total, aggregateTotals });
  }

  // ── Regular monthly period ───────────────────────────────────────────────────
  const where: {
    brandId: string | { in: string[] };
    period: string;
    creatorName?: { contains: string; mode: "insensitive" };
    label?: string;
  } = {
    brandId: brandFilter,
    period,
  };
  if (search) where.creatorName = { contains: search, mode: "insensitive" };
  if (label) where.label = label;

  const rows = await prisma.affiliateCreatorStat.findMany({
    where,
    orderBy: { [sortBy]: sortDir },
    take,
    skip,
    include: { brand: { select: { id: true, name: true, color: true } } },
  });

  const total = await prisma.affiliateCreatorStat.count({ where });

  const previousPeriod = previousMonth(period);
  const prevRanks = previousPeriod
    ? await prisma.affiliateCreatorStat.findMany({
        where: {
          brandId: where.brandId,
          period: previousPeriod,
          creatorName: { in: rows.map((r) => r.creatorName) },
        },
        select: { creatorName: true, rank: true, brandId: true },
      })
    : [];
  const prevRankByKey = new Map<string, number | null>();
  for (const p of prevRanks) prevRankByKey.set(`${p.brandId}|${p.creatorName}`, p.rank);

  const mapped = rows.map((r) => ({
    id: r.id,
    creatorName: r.creatorName,
    period: r.period,
    rank: r.rank,
    rankDelta: (() => {
      const prev = prevRankByKey.get(`${r.brandId}|${r.creatorName}`);
      if (prev == null || r.rank == null) return null;
      return prev - r.rank;
    })(),
    gmv: Number(r.gmv),
    refunds: Number(r.refunds),
    attributedOrders: r.attributedOrders,
    itemsSold: r.itemsSold,
    aov: Number(r.aov),
    videos: r.videos,
    liveStreams: r.liveStreams,
    estCommission: Number(r.estCommission),
    samplesShipped: r.samplesShipped,
    roi: r.roi == null ? null : Number(r.roi),
    label: r.label,
    brand: r.brand,
  }));

  return Response.json({ rows: mapped, total });
}

function previousMonth(period: string): string | null {
  const m = period.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  if (mo === 1) return `${y - 1}-12`;
  return `${y}-${String(mo - 1).padStart(2, "0")}`;
}
