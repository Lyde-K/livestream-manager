import { prisma } from "../src/lib/prisma";

async function main() {
  const brand = await prisma.brand.findUnique({ where: { name: "Kun Official" } });
  if (!brand) throw new Error("Kun Official brand not found");

  console.log("=== Top 5 Creators by GMV ===");
  const top = await prisma.affiliateCreatorStat.findMany({
    where: { brandId: brand.id, period: "2026-03" },
    orderBy: { gmv: "desc" },
    take: 5,
  });
  for (const c of top) {
    console.log(
      `  #${c.rank} ${c.creatorName.padEnd(25)} GMV ${Number(c.gmv).toFixed(2)} | ROI ${Number(c.roi ?? 0).toFixed(2)}x | label=${c.label} | videos=${c.videos} lives=${c.liveStreams} samples=${c.samplesShipped}`,
    );
  }

  console.log("\n=== Sample F-rank creators (blacklist) ===");
  const f = await prisma.affiliateCreatorStat.findMany({
    where: { brandId: brand.id, period: "2026-03", label: "F" },
    take: 5,
    orderBy: { samplesShipped: "desc" },
  });
  for (const c of f) {
    console.log(
      `  ${c.creatorName.padEnd(25)} GMV ${Number(c.gmv).toFixed(2)} | ROI ${Number(c.roi ?? 0).toFixed(2)}x | videos=${c.videos} lives=${c.liveStreams} samples=${c.samplesShipped}`,
    );
  }

  console.log("\n=== Top 3 Products ===");
  const tp = await prisma.affiliateProductStat.findMany({
    where: { brandId: brand.id, period: "2026-03" },
    orderBy: { gmv: "desc" },
    take: 3,
  });
  for (const p of tp) {
    console.log(
      `  ${p.productName.slice(0, 50).padEnd(52)} GMV ${Number(p.gmv).toFixed(2)} | ROI ${Number(p.roi ?? 0).toFixed(2)}x | tier=${p.tier}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
