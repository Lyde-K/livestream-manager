import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAffiliateScope, assertBrandAccess } from "@/lib/affiliate/scope";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

function fmt(n: number) {
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export async function GET(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY is not configured in environment variables" }, { status: 503 });
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  const scope = await getAffiliateScope(user);
  if (scope.brandIds.length === 0) return Response.json({ error: "No affiliate brands" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const brandId = sp.get("brandId");
  const period = sp.get("period"); // "YYYY-MM" or "YTD"

  if (brandId && !assertBrandAccess(scope, brandId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const brandFilter = brandId ?? { in: scope.brandIds };

  // ── Determine periods to analyse ─────────────────────────────────────────────
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
  const ytdPeriods = period === "YTD"
    ? periodList.filter((p) => p.startsWith(`${ytdYear}-`))
    : period
    ? [period]
    : periodList.filter((p) => p.startsWith(`${ytdYear}-`));

  // ── Fetch brand names ─────────────────────────────────────────────────────────
  const brands = await prisma.brand.findMany({
    where: { id: brandId ? brandId : { in: scope.brandIds } },
    select: { id: true, name: true },
  });
  const brandMap = new Map(brands.map((b) => [b.id, b.name]));

  // ── Aggregate creator stats across the selected periods ───────────────────────
  const [creatorGrouped, productGrouped, latestCreators] = await Promise.all([
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
      select: { creatorName: true, brandId: true, label: true, rank: true, roi: true },
    }),
  ]);

  const labelMap = new Map(latestCreators.map((r) => [`${r.brandId}|${r.creatorName}`, r]));

  // Build enriched creator list
  const creators = creatorGrouped.map((c) => {
    const latest = labelMap.get(`${c.brandId}|${c.creatorName}`);
    const gmv = Number(c._sum.gmv ?? 0);
    const comm = Number(c._sum.estCommission ?? 0);
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
      latestRank: latest?.rank ?? null,
    };
  }).sort((a, b) => b.gmv - a.gmv);

  const totalGmv = creators.reduce((s, c) => s + c.gmv, 0);
  const totalCreators = creators.length;

  // Top products — sort by GMV desc
  productGrouped.sort((a, b) => Number(b._sum.gmv ?? 0) - Number(a._sum.gmv ?? 0));

  const topProducts = productGrouped.slice(0, 10).map((p) => ({
    name: p.productName,
    brand: brandMap.get(p.brandId) ?? "",
    gmv: Number(p._sum.gmv ?? 0),
    itemsSold: p._sum.itemsSold ?? 0,
  }));

  // Label breakdown
  const labelCounts = { STAR: 0, A: 0, B: 0, F: 0 };
  for (const c of creators) {
    if (c.label && c.label in labelCounts) labelCounts[c.label as keyof typeof labelCounts]++;
  }

  // Segment creators for AI context
  const stars = creators.filter((c) => c.label === "STAR").slice(0, 5);
  const toReengage = creators.filter((c) => c.label === "A" && c.gmv > 0 && (c.liveStreams > 0 || c.videos > 0)).slice(0, 8);
  const sparkCandidates = creators.filter((c) => (c.label === "A" || c.label === "B") && (c.liveStreams >= 3 || c.videos >= 5) && c.roi != null && c.roi >= 1.5).slice(0, 8);
  const toAvoid = creators.filter((c) => c.label === "F" || (c.roi != null && c.roi < 0.5 && c.samplesShipped > 0)).slice(0, 8);
  const newTargets = creators.filter((c) => c.samplesShipped === 0 && c.gmv === 0).slice(0, 5);

  // ── Build AI prompt ───────────────────────────────────────────────────────────
  const periodLabel = period === "YTD" || !period ? `${ytdYear} Year to Date (${ytdPeriods.length} months)` : period;
  const brandLabel = brandId ? (brandMap.get(brandId) ?? "Selected Brand") : "All Brands";

  const prompt = `You are a senior affiliate marketing analyst for ${brandLabel}, a Malaysian TikTok/Shopee livestream commerce brand.

Analyse the following affiliate data for period: ${periodLabel}

## Summary
- Total GMV: ${fmt(totalGmv)}
- Total Creators: ${totalCreators}
- Label breakdown: ⭐ STAR: ${labelCounts.STAR}, A: ${labelCounts.A}, B: ${labelCounts.B}, F (blacklist): ${labelCounts.F}

## Top 10 Creators by GMV
${creators.slice(0, 10).map((c, i) => `${i + 1}. ${c.name} (${c.brand}) — GMV: ${fmt(c.gmv)}, ROI: ${c.roi?.toFixed(1) ?? "N/A"}x, Lives: ${c.liveStreams}, Videos: ${c.videos}, Label: ${c.label ?? "N/A"}`).join("\n")}

## Top 10 Products by GMV
${topProducts.map((p, i) => `${i + 1}. ${p.name} (${p.brand}) — GMV: ${fmt(p.gmv)}, Items Sold: ${p.itemsSold}`).join("\n")}

## STAR Creators
${stars.map((c) => `- ${c.name}: GMV ${fmt(c.gmv)}, ROI ${c.roi?.toFixed(1) ?? "N/A"}x, Lives: ${c.liveStreams}, Videos: ${c.videos}`).join("\n") || "None"}

## Potential Re-engagement (A-rank, active)
${toReengage.map((c) => `- ${c.name}: GMV ${fmt(c.gmv)}, ROI ${c.roi?.toFixed(1) ?? "N/A"}x, Lives: ${c.liveStreams}, Videos: ${c.videos}`).join("\n") || "None"}

## Spark/Boost Candidates (high activity, good ROI)
${sparkCandidates.map((c) => `- ${c.name}: GMV ${fmt(c.gmv)}, ROI ${c.roi?.toFixed(1) ?? "N/A"}x, Lives: ${c.liveStreams}, Videos: ${c.videos}`).join("\n") || "None"}

## Creators to Avoid (F-rank or poor ROI)
${toAvoid.map((c) => `- ${c.name}: GMV ${fmt(c.gmv)}, ROI ${c.roi?.toFixed(1) ?? "N/A"}x, Samples shipped: ${c.samplesShipped}`).join("\n") || "None"}

Please provide a structured JSON analysis with the following fields:
{
  "executiveSummary": "3-4 sentences. Overall performance assessment, key wins and concerns. Use RM currency.",
  "overallHealth": "STRONG | MODERATE | AT_RISK",
  "keyInsights": ["3-5 bullet insights about the affiliate program performance"],
  "reengagementList": [{"name": "...", "reason": "...", "action": "..."}],
  "sparkCodeList": [{"name": "...", "reason": "...", "expectedImpact": "..."}],
  "avoidList": [{"name": "...", "reason": "..."}],
  "newAffiliateTargeting": {
    "recommendedType": "Livestream | Video | Both",
    "reasoning": "...",
    "targetProfile": "Describe the ideal new affiliate to recruit for this brand"
  },
  "monthlyOutlook": "1-2 sentences on what to focus on next month"
}

Be specific, data-driven, and actionable. Write in plain English suitable for a brand manager. Currency in RM with commas.`;

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";

    // Extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const analysis = JSON.parse(jsonMatch[0]);

    return Response.json({
      analysis,
      meta: {
        brandLabel,
        periodLabel,
        totalGmv,
        totalCreators,
        labelCounts,
        ytdPeriods,
      },
    });
  } catch (err) {
    console.error("AI analysis error:", err);
    return Response.json({ error: "Failed to generate analysis" }, { status: 500 });
  }
}
