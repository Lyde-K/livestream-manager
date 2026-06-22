import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAffiliateScope, assertBrandAccess } from "@/lib/affiliate/scope";

function fmt(n: number) {
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function pct(n: number, total: number) {
  if (total === 0) return "0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  const scope = await getAffiliateScope(user);
  if (scope.brandIds.length === 0) return Response.json({ error: "No affiliate brands" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const brandId = sp.get("brandId");
  const period = sp.get("period");

  if (brandId && !assertBrandAccess(scope, brandId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const brandFilter = brandId ? brandId : { in: scope.brandIds };

  // ── Periods ───────────────────────────────────────────────────────────────────
  const allPeriods = await prisma.affiliateCreatorStat.findMany({
    where: { brandId: brandFilter },
    select: { period: true },
    distinct: ["period"],
    orderBy: { period: "asc" },
  });
  const periodList = allPeriods.map((p) => p.period);
  if (periodList.length === 0) return Response.json({ error: "No data" }, { status: 404 });

  const latestPeriod = periodList[periodList.length - 1];
  const ytdYear = latestPeriod.substring(0, 4);
  const ytdPeriods = period === "YTD" || !period
    ? periodList.filter((p) => p.startsWith(`${ytdYear}-`))
    : [period];

  const prevPeriodInList = ytdPeriods.length >= 2
    ? ytdPeriods[ytdPeriods.length - 2]
    : periodList.length >= 2 ? periodList[periodList.length - 2] : null;

  // ── Brand names ───────────────────────────────────────────────────────────────
  const brands = await prisma.brand.findMany({
    where: { id: brandId ? brandId : { in: scope.brandIds } },
    select: { id: true, name: true },
  });
  const brandMap = new Map(brands.map((b) => [b.id, b.name]));
  const brandLabel = brandId ? (brandMap.get(brandId) ?? "Selected Brand") : "All Brands";
  const periodLabel = period === "YTD" || !period
    ? `${ytdYear} Year to Date (${ytdPeriods.length} months)`
    : period;

  // ── Aggregate creator stats ───────────────────────────────────────────────────
  const [creatorGrouped, productGrouped, latestCreators, prevCreators] = await Promise.all([
    prisma.affiliateCreatorStat.groupBy({
      by: ["creatorName", "brandId"],
      where: { brandId: brandFilter, period: { in: ytdPeriods } },
      _sum: { gmv: true, estCommission: true, videos: true, liveStreams: true, samplesShipped: true },
    }),
    prisma.affiliateProductStat.groupBy({
      by: ["productName", "brandId"],
      where: { brandId: brandFilter, period: { in: ytdPeriods } },
      _sum: { gmv: true, itemsSold: true },
    }),
    prisma.affiliateCreatorStat.findMany({
      where: { brandId: brandFilter, period: latestPeriod },
      select: { creatorName: true, brandId: true, label: true, gmv: true, liveStreams: true, videos: true, estCommission: true, samplesShipped: true },
    }),
    prevPeriodInList ? prisma.affiliateCreatorStat.findMany({
      where: { brandId: brandFilter, period: prevPeriodInList },
      select: { creatorName: true, brandId: true, gmv: true },
    }) : Promise.resolve([]),
  ]);

  // Build enriched creator list
  const latestMap = new Map(latestCreators.map((r) => [`${r.brandId}|${r.creatorName}`, r]));
  const prevGmvMap = new Map(prevCreators.map((r) => [`${r.brandId}|${r.creatorName}`, Number(r.gmv)]));

  const creators = creatorGrouped.map((c) => {
    const latest = latestMap.get(`${c.brandId}|${c.creatorName}`);
    const gmv = Number(c._sum.gmv ?? 0);
    const comm = Number(c._sum.estCommission ?? 0);
    const prevGmv = prevGmvMap.get(`${c.brandId}|${c.creatorName}`) ?? 0;
    return {
      name: c.creatorName,
      brand: brandMap.get(c.brandId) ?? "",
      gmv,
      estCommission: comm,
      roi: comm > 0 ? gmv / comm : null,
      videos: c._sum.videos ?? 0,
      liveStreams: c._sum.liveStreams ?? 0,
      samplesShipped: c._sum.samplesShipped ?? 0,
      label: latest?.label ?? null,
      prevGmv,
      momDelta: prevGmv > 0 ? ((gmv - prevGmv) / prevGmv) * 100 : null,
    };
  }).sort((a, b) => b.gmv - a.gmv);

  const totalGmv = creators.reduce((s, c) => s + c.gmv, 0);
  const totalCreators = creators.length;
  const totalLives = creators.reduce((s, c) => s + c.liveStreams, 0);
  const totalVideos = creators.reduce((s, c) => s + c.videos, 0);

  const labelCounts = { STAR: 0, A: 0, B: 0, F: 0 };
  for (const c of creators) {
    if (c.label && c.label in labelCounts) labelCounts[c.label as keyof typeof labelCounts]++;
  }

  // Top products
  productGrouped.sort((a, b) => Number(b._sum.gmv ?? 0) - Number(a._sum.gmv ?? 0));
  const topProducts = productGrouped.slice(0, 10).map((p) => ({
    name: p.productName,
    brand: brandMap.get(p.brandId) ?? "",
    gmv: Number(p._sum.gmv ?? 0),
    itemsSold: p._sum.itemsSold ?? 0,
  }));

  // ── Compute insights ──────────────────────────────────────────────────────────

  // GMV concentration — top 3 vs rest
  const top3Gmv = creators.slice(0, 3).reduce((s, c) => s + c.gmv, 0);
  const top3Pct = totalGmv > 0 ? (top3Gmv / totalGmv) * 100 : 0;

  // ROI averages
  const roiCreators = creators.filter((c) => c.roi !== null);
  const avgRoi = roiCreators.length > 0 ? roiCreators.reduce((s, c) => s + c.roi!, 0) / roiCreators.length : null;

  // Live vs video GMV split
  const liveGmv = latestCreators.filter((c) => c.liveStreams > 0).reduce((s, c) => s + Number(c.gmv), 0);
  const videoGmv = latestCreators.filter((c) => c.videos > 0 && c.liveStreams === 0).reduce((s, c) => s + Number(c.gmv), 0);

  // MoM trend for the latest period
  const prevTotalGmv = prevCreators.reduce((s, r) => s + Number(r.gmv), 0);
  const momGmvPct = prevTotalGmv > 0 ? ((totalGmv - prevTotalGmv) / prevTotalGmv) * 100 : null;

  // Segments
  const stars = creators.filter((c) => c.label === "STAR");
  const aRank = creators.filter((c) => c.label === "A");
  const bRank = creators.filter((c) => c.label === "B");
  const fRank = creators.filter((c) => c.label === "F");

  // Re-engagement: A-rank creators who were active but GMV declined or are in latest period with low activity
  const reengagementList = aRank
    .filter((c) => c.momDelta !== null && c.momDelta < -10)
    .slice(0, 6)
    .map((c) => ({
      name: c.name,
      reason: `GMV dropped ${Math.abs(c.momDelta!).toFixed(0)}% MoM from ${fmt(c.prevGmv)} to ${fmt(c.gmv)}. ROI is ${c.roi?.toFixed(1) ?? "N/A"}x.`,
      action: c.liveStreams > c.videos
        ? "Schedule a priority livestream slot and offer an exclusive deal to re-activate."
        : "Send a new product kit and request a video post within 2 weeks.",
    }));

  // Spark/boost: B-rank or A-rank with high activity and ROI ≥ 1.5x — worth investing in
  const sparkCodeList = creators
    .filter((c) => (c.label === "B" || c.label === "A") && c.roi !== null && c.roi >= 1.5 && (c.liveStreams >= 2 || c.videos >= 3))
    .slice(0, 6)
    .map((c) => ({
      name: c.name,
      reason: `ROI of ${c.roi!.toFixed(1)}x with ${c.liveStreams} lives and ${c.videos} videos — strong engagement signal.`,
      expectedImpact: `Boosting content could push GMV from ${fmt(c.gmv)} toward the next label tier.`,
    }));

  // Avoid: F-rank or ROI < 0.5x with samples shipped
  const avoidList = creators
    .filter((c) => c.label === "F" || (c.roi !== null && c.roi < 0.5 && c.samplesShipped > 0))
    .slice(0, 8)
    .map((c) => ({
      name: c.name,
      reason: `${c.samplesShipped} samples shipped, ${fmt(c.gmv)} GMV. ROI ${c.roi?.toFixed(1) ?? "0"}x — cost exceeds returns.`,
    }));

  // ── Overall health score ──────────────────────────────────────────────────────
  const starPct = totalCreators > 0 ? (labelCounts.STAR / totalCreators) * 100 : 0;
  const fPct = totalCreators > 0 ? (labelCounts.F / totalCreators) * 100 : 0;
  const overallHealth: "STRONG" | "MODERATE" | "AT_RISK" =
    starPct >= 5 && fPct < 20 && (avgRoi === null || avgRoi >= 1.5) ? "STRONG"
    : fPct >= 35 || (avgRoi !== null && avgRoi < 0.8) ? "AT_RISK"
    : "MODERATE";

  // ── Executive summary ─────────────────────────────────────────────────────────
  const momSentence = momGmvPct !== null
    ? `GMV ${momGmvPct >= 0 ? "grew" : "declined"} ${Math.abs(momGmvPct).toFixed(1)}% compared to the previous period.`
    : "";
  const concentrationNote = top3Pct > 60
    ? `Top 3 creators account for ${top3Pct.toFixed(0)}% of GMV — high dependency risk.`
    : `GMV is reasonably spread across the creator base (top 3 = ${top3Pct.toFixed(0)}%).`;

  const executiveSummary =
    `${brandLabel} generated ${fmt(totalGmv)} across ${totalCreators} creators for ${periodLabel}. ` +
    `${momSentence} ` +
    `The program has ${labelCounts.STAR} STAR creators and ${labelCounts.F} on the avoid list. ` +
    concentrationNote;

  // ── Key insights ──────────────────────────────────────────────────────────────
  const keyInsights: string[] = [];

  if (top3Pct > 60) {
    keyInsights.push(`High GMV concentration: top 3 creators drive ${top3Pct.toFixed(0)}% of total GMV (${fmt(top3Gmv)}). Diversify to reduce risk.`);
  } else {
    keyInsights.push(`Healthy GMV spread: top 3 creators contribute ${top3Pct.toFixed(0)}% of GMV. No single dependency risk.`);
  }

  if (avgRoi !== null) {
    keyInsights.push(`Average ROI across active creators is ${avgRoi.toFixed(1)}x. ${avgRoi >= 2 ? "Commission spend is well-justified." : avgRoi >= 1 ? "Moderate returns — review lower-ROI creators." : "ROI below break-even — review commission rates or creator mix urgently."}`);
  }

  if (totalLives > 0 || totalVideos > 0) {
    const dominantChannel = totalLives >= totalVideos ? "Livestream" : "Video";
    keyInsights.push(`${dominantChannel} is the dominant channel: ${totalLives} lives vs ${totalVideos} videos in the period. ${dominantChannel === "Livestream" ? "Prioritise scheduling quality hosts." : "Focus on video content quality and product placement."}`);
  }

  if (fPct > 20) {
    keyInsights.push(`${fPct.toFixed(0)}% of creators (${labelCounts.F}) are on the avoid list — review sample allocation to ensure ROI-positive creators get priority.`);
  }

  if (labelCounts.B > labelCounts.A + labelCounts.STAR) {
    keyInsights.push(`Large B-rank pool (${labelCounts.B} creators) — strong pipeline to develop into A and STAR. Identify the top 10 B-ranks for targeted investment.`);
  }

  if (topProducts.length > 0) {
    keyInsights.push(`Top product "${topProducts[0].name}" generated ${fmt(topProducts[0].gmv)} — ${pct(topProducts[0].gmv, totalGmv)} of total GMV. Ensure consistent stock and creator promotion for this SKU.`);
  }

  // ── New affiliate targeting ───────────────────────────────────────────────────
  const liveRoiCreators = latestCreators.filter((c) => c.liveStreams > 0);
  const videoRoiCreators = latestCreators.filter((c) => c.videos > 0 && c.liveStreams === 0);
  const recommendedType = liveGmv >= videoGmv * 1.5 ? "Livestream" : videoGmv >= liveGmv * 1.5 ? "Video" : "Both";

  const newAffiliateTargeting = {
    recommendedType,
    reasoning: recommendedType === "Livestream"
      ? `Livestream creators generate significantly more GMV (${fmt(liveGmv)}) than video-only creators (${fmt(videoGmv)}). Recruit creators with an active TikTok LIVE track record.`
      : recommendedType === "Video"
      ? `Video creators outperform livestream in this period (${fmt(videoGmv)} vs ${fmt(liveGmv)}). Shoppable video content is the better channel here.`
      : `Both channels contribute meaningfully (Lives: ${fmt(liveGmv)}, Videos: ${fmt(videoGmv)}). Recruit a mix of live hosts and video creators.`,
    targetProfile: `Creators with ${recommendedType === "Video" ? "5+ shoppable videos" : "regular LIVE sessions (2+ per month)"}, GMV track record in the ${topProducts[0] ? topProducts[0].name.split(" ").slice(0, 2).join(" ") : "relevant"} product category, and an engaged follower base of 10K+.`,
  };

  // ── Monthly outlook ───────────────────────────────────────────────────────────
  const monthlyOutlook = reengagementList.length > 0
    ? `Priority next period: re-activate ${reengagementList.length} declining A-rank creator${reengagementList.length > 1 ? "s" : ""} and double down on the ${sparkCodeList.length} Spark candidates to lift GMV without increasing sample costs.`
    : `Maintain momentum from current STAR creators and invest in converting the top B-rank creators into A-rank through targeted product seeding and content incentives.`;

  // ── Response ──────────────────────────────────────────────────────────────────
  const meta = { brandLabel, periodLabel, totalGmv, totalCreators, labelCounts, ytdPeriods };
  const analysis = {
    executiveSummary,
    overallHealth,
    keyInsights,
    reengagementList,
    sparkCodeList,
    avoidList,
    newAffiliateTargeting,
    monthlyOutlook,
  };

  return Response.json({ meta, analysis });
}
