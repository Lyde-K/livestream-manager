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
    productName?: { contains: string; mode: "insensitive" };
    tier?: string;
    category?: string;
  } = {
    brandId: brandId ?? { in: scope.brandIds },
    period,
  };
  if (search) where.productName = { contains: search, mode: "insensitive" };
  if (tier) where.tier = tier;
  if (category) where.category = category;

  const [rows, categories] = await Promise.all([
    prisma.affiliateProductStat.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      take: 200,
      include: { brand: { select: { id: true, name: true, color: true } } },
    }),
    prisma.affiliateProductStat.findMany({
      where: { brandId: brandId ?? { in: scope.brandIds }, period },
      select: { category: true },
      distinct: ["category"],
    }),
  ]);

  // Fetch prev-period GMV for MoM delta
  const prevGmvMap = new Map<string, number>();
  if (prevPeriod && rows.length > 0) {
    const prevRows = await prisma.affiliateProductStat.findMany({
      where: {
        brandId: brandId ?? { in: scope.brandIds },
        period: prevPeriod,
        productId: { in: rows.map((r) => r.productId) },
      },
      select: { productId: true, brandId: true, gmv: true },
    });
    for (const pr of prevRows) prevGmvMap.set(`${pr.productId}|${pr.brandId}`, Number(pr.gmv));
  }

  return Response.json({
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
