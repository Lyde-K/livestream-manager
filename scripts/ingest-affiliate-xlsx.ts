import ExcelJS from "exceljs";
import { prisma } from "../src/lib/prisma";
import { parseCreatorRows, parseProductRows } from "../src/lib/affiliate/parser";
import { recomputeCreatorLabels, recomputeProductTiers } from "../src/lib/affiliate/labels";

async function readGrid(path: string): Promise<unknown[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error(`No sheet in ${path}`);
  const grid: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = row.values as unknown[];
    grid.push(vals.slice(1));
  });
  return grid;
}

async function main() {
  const [brandName, period, creatorsPath, productsPath] = process.argv.slice(2);
  if (!brandName || !period) {
    console.error("Usage: tsx scripts/ingest-affiliate-xlsx.ts <BrandName> <YYYY-MM> [creatorsXlsx] [productsXlsx]");
    process.exit(1);
  }
  const brand = await prisma.brand.findUnique({ where: { name: brandName } });
  if (!brand) {
    console.error(`Brand not found: ${brandName}`);
    process.exit(1);
  }
  if (!brand.hasAffiliate) {
    console.error(`Brand "${brand.name}" is not flagged as hasAffiliate`);
    process.exit(1);
  }

  let creators = 0;
  let products = 0;

  if (creatorsPath) {
    console.log(`Reading creators: ${creatorsPath}`);
    const grid = await readGrid(creatorsPath);
    const parsed = parseCreatorRows(grid);
    console.log(`  parsed ${parsed.length} creator rows`);
    await prisma.$transaction([
      prisma.affiliateCreatorStat.deleteMany({ where: { brandId: brand.id, period } }),
      prisma.affiliateCreatorStat.createMany({
        data: parsed.map((r) => ({
          brandId: brand.id,
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
        data: { brandId: brand.id, period, kind: "CREATOR", source: "XLSX", rowCount: parsed.length },
      }),
    ]);
    await recomputeCreatorLabels(brand.id, period);
    creators = parsed.length;
  }

  if (productsPath) {
    console.log(`Reading products: ${productsPath}`);
    const grid = await readGrid(productsPath);
    const parsed = parseProductRows(grid);
    console.log(`  parsed ${parsed.length} product rows`);
    await prisma.$transaction([
      prisma.affiliateProductStat.deleteMany({ where: { brandId: brand.id, period } }),
      prisma.affiliateProductStat.createMany({
        data: parsed.map((r) => ({
          brandId: brand.id,
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
        data: { brandId: brand.id, period, kind: "PRODUCT", source: "XLSX", rowCount: parsed.length },
      }),
    ]);
    await recomputeProductTiers(brand.id, period);
    products = parsed.length;
  }

  console.log(`\nDone — ${brand.name} / ${period}: ${creators} creators, ${products} products`);

  if (creators > 0) {
    const dist = await prisma.affiliateCreatorStat.groupBy({
      by: ["label"],
      where: { brandId: brand.id, period },
      _count: { _all: true },
    });
    console.log("Creator label distribution:");
    for (const d of dist) console.log(`  ${d.label}: ${d._count._all}`);
  }
  if (products > 0) {
    const tiers = await prisma.affiliateProductStat.groupBy({
      by: ["tier"],
      where: { brandId: brand.id, period },
      _count: { _all: true },
    });
    console.log("Product tier distribution:");
    for (const t of tiers) console.log(`  ${t.tier}: ${t._count._all}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
