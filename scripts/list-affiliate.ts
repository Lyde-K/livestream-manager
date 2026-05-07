import { prisma } from "../src/lib/prisma";

async function main() {
  const brands = await prisma.brand.findMany({
    where: { hasAffiliate: true },
    select: { id: true, name: true },
  });
  console.log("Affiliate brands:", brands);

  const periods = await prisma.affiliateCreatorStat.findMany({
    select: { brandId: true, period: true },
    distinct: ["brandId", "period"],
  });
  console.log("Periods:", periods);
  await prisma.$disconnect();
}
main().catch(console.error);
