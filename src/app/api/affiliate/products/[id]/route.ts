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

  // Fetch the target row to get productId + brandId, then load all periods for that product
  const anchor = await prisma.affiliateProductStat.findUnique({
    where: { id },
    select: { productId: true, productName: true, brandId: true, brand: { select: { id: true, name: true, color: true } } },
  });

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
