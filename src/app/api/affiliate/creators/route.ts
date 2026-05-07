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
  const take = Math.min(parseInt(sp.get("limit") ?? "100", 10) || 100, 500);

  if (!period) return Response.json({ error: "period is required" }, { status: 400 });
  if (brandId && !assertBrandAccess(scope, brandId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!SORT_FIELDS.has(sortBy)) {
    return Response.json({ error: `invalid sortBy: ${sortBy}` }, { status: 400 });
  }

  const where: {
    brandId: string | { in: string[] };
    period: string;
    creatorName?: { contains: string; mode: "insensitive" };
    label?: string;
  } = {
    brandId: brandId ?? { in: scope.brandIds },
    period,
  };
  if (search) where.creatorName = { contains: search, mode: "insensitive" };
  if (label) where.label = label;

  const rows = await prisma.affiliateCreatorStat.findMany({
    where,
    orderBy: { [sortBy]: sortDir },
    take,
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
