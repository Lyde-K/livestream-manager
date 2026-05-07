import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  parseCreatorRows,
  parseProductRows,
  isValidPeriod,
  type CreatorRow,
  type ProductRow,
} from "@/lib/affiliate/parser";
import {
  recomputeCreatorLabels,
  recomputeProductTiers,
} from "@/lib/affiliate/labels";

interface ImportPayload {
  brandId: string;
  period: string;
  source?: "XLSX" | "SHEET";
  creatorRows?: unknown[][];
  productRows?: unknown[][];
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as ImportPayload;
  const { brandId, period, source = "XLSX", creatorRows, productRows } = body;

  if (!brandId || !period) {
    return Response.json({ error: "brandId and period are required" }, { status: 400 });
  }
  if (!isValidPeriod(period)) {
    return Response.json({ error: "period must be YYYY-MM" }, { status: 400 });
  }

  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) return Response.json({ error: "Brand not found" }, { status: 404 });
  if (!brand.hasAffiliate) {
    return Response.json(
      { error: `Brand "${brand.name}" is not flagged as an affiliate brand. Enable it in admin → brands.` },
      { status: 422 },
    );
  }

  const userId = (session.user as { id: string }).id;
  const summary = { creators: 0, products: 0 };

  if (creatorRows && creatorRows.length > 0) {
    let parsed: CreatorRow[];
    try {
      parsed = parseCreatorRows(creatorRows);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to parse creator rows";
      return Response.json({ error: msg }, { status: 422 });
    }

    await prisma.$transaction([
      prisma.affiliateCreatorStat.deleteMany({ where: { brandId, period } }),
      prisma.affiliateCreatorStat.createMany({
        data: parsed.map((r) => ({
          brandId,
          period,
          creatorName: r.creatorName,
          gmv: r.gmv,
          refunds: r.refunds,
          attributedOrders: r.attributedOrders,
          itemsSold: r.itemsSold,
          itemsRefunded: r.itemsRefunded,
          aov: r.aov,
          avgDailyProductsSold: r.avgDailyProductsSold,
          videos: r.videos,
          liveStreams: r.liveStreams,
          estCommission: r.estCommission,
          samplesShipped: r.samplesShipped,
        })),
      }),
      prisma.affiliateImport.create({
        data: { brandId, period, kind: "CREATOR", source, rowCount: parsed.length, importedBy: userId },
      }),
    ]);

    await recomputeCreatorLabels(brandId, period);
    summary.creators = parsed.length;
  }

  if (productRows && productRows.length > 0) {
    let parsed: ProductRow[];
    try {
      parsed = parseProductRows(productRows);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to parse product rows";
      return Response.json({ error: msg }, { status: 422 });
    }

    await prisma.$transaction([
      prisma.affiliateProductStat.deleteMany({ where: { brandId, period } }),
      prisma.affiliateProductStat.createMany({
        data: parsed.map((r) => ({
          brandId,
          period,
          productId: r.productId,
          productName: r.productName,
          category: r.category,
          gmv: r.gmv,
          refunds: r.refunds,
          itemsSold: r.itemsSold,
          itemsRefunded: r.itemsRefunded,
          attributedOrders: r.attributedOrders,
          avgDailyCustomers: r.avgDailyCustomers,
          avgDailyCreatorsWithSales: r.avgDailyCreatorsWithSales,
          avgDailyCreatorsPosted: r.avgDailyCreatorsPosted,
          avgDailyVideosWithSales: r.avgDailyVideosWithSales,
          avgDailyLivesWithSales: r.avgDailyLivesWithSales,
          videos: r.videos,
          liveStreams: r.liveStreams,
          estCommission: r.estCommission,
          samplesShipped: r.samplesShipped,
        })),
      }),
      prisma.affiliateImport.create({
        data: { brandId, period, kind: "PRODUCT", source, rowCount: parsed.length, importedBy: userId },
      }),
    ]);

    await recomputeProductTiers(brandId, period);
    summary.products = parsed.length;
  }

  if (summary.creators === 0 && summary.products === 0) {
    return Response.json({ error: "No rows provided in either creators or products" }, { status: 400 });
  }

  return Response.json({ ok: true, brand: brand.name, period, ...summary });
}
