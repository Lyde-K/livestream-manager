import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAffiliateScope, assertBrandAccess } from "@/lib/affiliate/scope";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  const scope = await getAffiliateScope(user);
  if (scope.brandIds.length === 0) {
    return Response.json({ products: [] });
  }

  const sp = req.nextUrl.searchParams;
  const brandId = sp.get("brandId");
  const periodParam = sp.get("period"); // "YYYY-MM" or "YTD"
  const fromParam = sp.get("from");
  const toParam = sp.get("to");

  if (brandId && !assertBrandAccess(scope, brandId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const brandFilter = brandId ?? { in: scope.brandIds };

  // Determine which periods to include
  let periodFilter: { period?: string } | { period: { in: string[] } } = {};

  if (fromParam && toParam) {
    // Range mode: need all periods in the DB to filter
    const allPeriods = await prisma.affiliateProductStat.findMany({
      where: { brandId: brandFilter },
      select: { period: true },
      distinct: ["period"],
    });
    const periods = allPeriods.map((r) => r.period).filter((p) => p >= fromParam && p <= toParam);
    periodFilter = { period: { in: periods } };
  } else if (periodParam === "YTD") {
    // Get latest period to determine the year
    const latest = await prisma.affiliateProductStat.findFirst({
      where: { brandId: brandFilter },
      orderBy: { period: "desc" },
      select: { period: true },
    });
    if (latest) {
      const ytdYear = latest.period.substring(0, 4);
      const allPeriods = await prisma.affiliateProductStat.findMany({
        where: { brandId: brandFilter },
        select: { period: true },
        distinct: ["period"],
      });
      const periods = allPeriods.map((r) => r.period).filter((p) => p.startsWith(`${ytdYear}-`));
      periodFilter = { period: { in: periods } };
    }
  } else if (periodParam) {
    periodFilter = { period: periodParam };
  }

  // Group by productId+productName to aggregate metrics across periods
  const grouped = await prisma.affiliateProductStat.groupBy({
    by: ["productId", "productName"],
    where: { brandId: brandFilter, ...periodFilter },
    _sum: { gmv: true, videos: true, liveStreams: true, estCommission: true },
    orderBy: { _sum: { gmv: "desc" } },
  });

  const products = grouped.map((g) => ({
    productId: g.productId,
    productName: g.productName,
    gmv: Number(g._sum.gmv ?? 0),
    videos: Number(g._sum.videos ?? 0),
    liveStreams: Number(g._sum.liveStreams ?? 0),
    estCommission: Number(g._sum.estCommission ?? 0),
  }));

  return Response.json({ products });
}
