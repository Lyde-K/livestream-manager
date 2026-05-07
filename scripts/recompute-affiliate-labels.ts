import { prisma } from "../src/lib/prisma";
import { recomputeCreatorLabels, recomputeProductTiers } from "../src/lib/affiliate/labels";

async function main() {
  const onlyBrand = process.argv[2]; // optional brand name
  const where = onlyBrand ? { name: onlyBrand } : { hasAffiliate: true };
  const brands = await prisma.brand.findMany({ where, select: { id: true, name: true } });

  for (const b of brands) {
    const periods = await prisma.affiliateCreatorStat.findMany({
      where: { brandId: b.id },
      select: { period: true },
      distinct: ["period"],
      orderBy: { period: "asc" },
    });
    if (periods.length === 0) {
      console.log(`${b.name}: no creator data`);
      continue;
    }
    console.log(`\n${b.name} — recomputing ${periods.length} period(s)`);
    for (const p of periods) {
      await recomputeCreatorLabels(b.id, p.period);
      await recomputeProductTiers(b.id, p.period);
      const dist = await prisma.affiliateCreatorStat.groupBy({
        by: ["label"],
        where: { brandId: b.id, period: p.period },
        _count: { _all: true },
      });
      const summary = dist.map((d) => `${d.label}=${d._count._all}`).join(", ");
      console.log(`  ${p.period}: ${summary}`);
    }
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
