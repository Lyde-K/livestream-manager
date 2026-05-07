import { prisma } from "../src/lib/prisma";

async function main() {
  const brand = await prisma.brand.findUnique({ where: { name: "Kun Official MY" } });
  if (!brand) throw new Error("Kun Official MY not found");

  const periods = await prisma.affiliateCreatorStat.findMany({
    where: { brandId: brand.id },
    select: { period: true },
    distinct: ["period"],
    orderBy: { period: "desc" },
  });
  console.log("Periods loaded:", periods.map((p) => p.period).join(", "));

  const labelDist = await prisma.affiliateCreatorStat.groupBy({
    by: ["period", "label"],
    where: { brandId: brand.id },
    _count: { _all: true },
  });
  console.log("\nLabel distribution per period:");
  const grouped = new Map<string, Record<string, number>>();
  for (const d of labelDist) {
    if (!grouped.has(d.period)) grouped.set(d.period, {});
    grouped.get(d.period)![d.label ?? "null"] = d._count._all;
  }
  for (const [p, dist] of [...grouped.entries()].sort()) {
    console.log(`  ${p}:`, dist);
  }

  if (periods.length === 0) return;
  const latest = periods[0].period;
  console.log(`\nLatest period: ${latest}`);

  // Pick top 5 creators in latest period by GMV — see why they don't qualify for STAR
  const topInLatest = await prisma.affiliateCreatorStat.findMany({
    where: { brandId: brand.id, period: latest },
    orderBy: { gmv: "desc" },
    take: 5,
  });

  // top 10% threshold
  const all = await prisma.affiliateCreatorStat.findMany({
    where: { brandId: brand.id, period: latest },
    select: { gmv: true },
    orderBy: { gmv: "desc" },
  });
  const starIdx = Math.floor(all.length * 0.10);
  const starThreshold = Number(all[Math.min(starIdx, all.length - 1)].gmv);
  const aIdx = Math.floor(all.length * 0.30);
  const aThreshold = Number(all[Math.min(aIdx, all.length - 1)].gmv);
  const topRankCutoff = Math.ceil(all.length * 0.30);
  console.log(`\nThresholds for ${latest} (cohort=${all.length}):`);
  console.log(`  STAR top-10% GMV ≥ RM ${starThreshold.toFixed(2)}`);
  console.log(`  A    top-30% GMV ≥ RM ${aThreshold.toFixed(2)}`);
  console.log(`  Top-rank cutoff for consec check: rank ≤ ${topRankCutoff}`);

  console.log(`\nTop 5 creators in ${latest} — why no STAR?`);
  for (const c of topInLatest) {
    const hist = await prisma.affiliateCreatorStat.findMany({
      where: { brandId: brand.id, creatorName: c.creatorName },
      select: { period: true, gmv: true, rank: true, label: true },
      orderBy: { period: "desc" },
    });
    const monthsActive = hist.length;
    const monthsWithSales = hist.filter((h) => Number(h.gmv) > 0).length;
    const consistency = monthsActive > 0 ? monthsWithSales / monthsActive : 0;
    let consec = 0;
    for (const h of hist) {
      if (h.rank != null && h.rank <= topRankCutoff) consec++;
      else break;
    }
    const gmv = Number(c.gmv);
    const roi = c.roi == null ? 0 : Number(c.roi);

    const checks = {
      "top10%": gmv >= starThreshold,
      "ROI≥3x": roi >= 3,
      "consistency≥0.8": consistency >= 0.8,
      "consec≥3": consec >= 3,
    };
    const passing = Object.values(checks).every(Boolean);

    console.log(`\n  ${c.creatorName} (label=${c.label}, rank=${c.rank})`);
    console.log(`    GMV=RM${gmv.toFixed(0)} ROI=${roi.toFixed(1)}x consistency=${consistency.toFixed(2)} consec=${consec}/${hist.length}`);
    console.log(`    History:`, hist.map((h) => `${h.period}:rank${h.rank ?? "—"}`).join(" → "));
    console.log(`    Checks:`, checks, passing ? "→ STAR" : "→ NOT STAR");
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
