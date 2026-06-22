import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAffiliateScope } from "@/lib/affiliate/scope";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  const scope = await getAffiliateScope(user);
  if (scope.brandIds.length === 0) return Response.json({ history: [] });

  const { id } = await params;

  // Support two id formats:
  //  1. A real DB UUID (single-period rows)
  //  2. "brandId|productId" composite (YTD aggregated rows with no latest-period entry)
  let anchor: { productId: string; productName: string; brandId: string; brand: { id: string; name: string; color: string } } | null = null;

  if (id.includes("|")) {
    const [brandId, productId] = id.split("|");
    anchor = await prisma.affiliateProductStat.findFirst({
      where: { brandId, productId },
      select: { productId: true, productName: true, brandId: true, brand: { select: { id: true, name: true, color: true } } },
    });
  } else {
    anchor = await prisma.affiliateProductStat.findUnique({
      where: { id },
      select: { productId: true, productName: true, brandId: true, brand: { select: { id: true, name: true, color: true } } },
    });
  }

  if (!anchor || !scope.brandIds.includes(anchor.brandId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const rows = await prisma.affiliateProductStat.findMany({
    where: { brandId: anchor.brandId, productId: anchor.productId },
    orderBy: { period: "asc" },
    select: {
      id: true,
      period: true,
      gmv: true,
      refunds: true,
      itemsSold: true,
      itemsRefunded: true,
      attributedOrders: true,
      videos: true,
      liveStreams: true,
      estCommission: true,
      samplesShipped: true,
      roi: true,
      tier: true,
      category: true,
    },
  });

  return Response.json({
    productId: anchor.productId,
    productName: anchor.productName,
    brand: anchor.brand,
    history: rows.map((r) => ({
      id: r.id,
      period: r.period,
      gmv: Number(r.gmv),
      refunds: Number(r.refunds),
      itemsSold: r.itemsSold,
      itemsRefunded: r.itemsRefunded,
      attributedOrders: r.attributedOrders,
      videos: r.videos,
      liveStreams: r.liveStreams,
      estCommission: Number(r.estCommission),
      samplesShipped: r.samplesShipped,
      roi: r.roi == null ? null : Number(r.roi),
      tier: r.tier,
      category: r.category,
    })),
  });
}
