import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAffiliateScope, assertBrandAccess } from "@/lib/affiliate/scope";
import { AFFILIATE_KNOWLEDGE } from "@/lib/affiliate/chat-knowledge";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

function fmt(n: number) {
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  const scope = await getAffiliateScope(user);
  if (scope.brandIds.length === 0)
    return Response.json({ error: "No affiliate brands" }, { status: 403 });

  const body = await req.json() as {
    message: string;
    brandId?: string;
    period?: string;
    history?: { role: "user" | "assistant"; content: string }[];
  };

  const { message, brandId, period = "YTD", history = [] } = body;
  if (!message?.trim()) return Response.json({ error: "No message" }, { status: 400 });

  if (brandId && !assertBrandAccess(scope, brandId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const brandFilter = brandId ?? { in: scope.brandIds };

  // ── Load data context ────────────────────────────────────────────────────────
  const allPeriods = await prisma.affiliateCreatorStat.findMany({
    where: { brandId: brandFilter },
    select: { period: true },
    distinct: ["period"],
    orderBy: { period: "asc" },
  });
  const periodList = allPeriods.map((p) => p.period);
  if (periodList.length === 0)
    return Response.json({ error: "No data available" }, { status: 404 });

  const latestPeriod = periodList[periodList.length - 1];
  const ytdYear = latestPeriod.substring(0, 4);
  const activePeriods = period === "YTD"
    ? periodList.filter((p) => p.startsWith(`${ytdYear}-`))
    : periodList.includes(period) ? [period] : [latestPeriod];

  const brands = await prisma.brand.findMany({
    where: { id: brandId ? brandId : { in: scope.brandIds } },
    select: { id: true, name: true },
  });
  const brandMap = new Map(brands.map((b) => [b.id, b.name]));
  const brandLabel = brandId ? (brandMap.get(brandId) ?? "Selected Brand") : "All Brands";

  // Periods before the active window — used to detect truly new affiliates
  const priorPeriods = periodList.filter((p) => !activePeriods.includes(p));

  const [creatorGrouped, productGrouped, latestCreators, priorCreatorNames] = await Promise.all([
    prisma.affiliateCreatorStat.groupBy({
      by: ["creatorName", "brandId"],
      where: { brandId: brandFilter, period: { in: activePeriods } },
      _sum: { gmv: true, estCommission: true, videos: true, liveStreams: true, samplesShipped: true },
    }),
    prisma.affiliateProductStat.groupBy({
      by: ["productName", "brandId"],
      where: { brandId: brandFilter, period: { in: activePeriods } },
      _sum: { gmv: true, itemsSold: true },
      orderBy: { _sum: { gmv: "desc" } },
      take: 20,
    }),
    prisma.affiliateCreatorStat.findMany({
      where: { brandId: brandFilter, period: latestPeriod },
      select: { creatorName: true, brandId: true, label: true },
    }),
    // All creator names that appeared in ANY period before the active window
    priorPeriods.length > 0
      ? prisma.affiliateCreatorStat.findMany({
          where: { brandId: brandFilter, period: { in: priorPeriods } },
          select: { creatorName: true, brandId: true },
          distinct: ["creatorName", "brandId"],
        })
      : Promise.resolve([]),
  ]);

  const labelMap = new Map(latestCreators.map((r) => [`${r.brandId}|${r.creatorName}`, r.label]));
  const priorCreatorSet = new Set(priorCreatorNames.map((r) => `${r.brandId}|${r.creatorName}`));

  const creators = creatorGrouped.map((c) => {
    const gmv = Number(c._sum.gmv ?? 0);
    const comm = Number(c._sum.estCommission ?? 0);
    const key = `${c.brandId}|${c.creatorName}`;
    return {
      name: c.creatorName,
      brand: brandMap.get(c.brandId) ?? "",
      gmv,
      estCommission: comm,
      roi: comm > 0 ? +(gmv / comm).toFixed(2) : null,
      videos: c._sum.videos ?? 0,
      liveStreams: c._sum.liveStreams ?? 0,
      samplesShipped: c._sum.samplesShipped ?? 0,
      label: labelMap.get(key) ?? null,
      isNew: priorPeriods.length > 0 && !priorCreatorSet.has(key),
    };
  }).sort((a, b) => b.gmv - a.gmv);

  const totalGmv = creators.reduce((s, c) => s + c.gmv, 0);
  const labelCounts = { STAR: 0, A: 0, B: 0, F: 0 };
  for (const c of creators) {
    if (c.label && c.label in labelCounts) labelCounts[c.label as keyof typeof labelCounts]++;
  }

  const newAffiliates = creators.filter((c) => c.isNew);

  const top20Creators = creators.slice(0, 20).map((c) =>
    `- ${c.name} (${c.brand})${c.isNew ? " [NEW]" : ""}: GMV ${fmt(c.gmv)}, ROI ${c.roi ?? "N/A"}x, ${c.liveStreams} lives, ${c.videos} videos, ${c.samplesShipped} samples, label: ${c.label ?? "none"}`
  ).join("\n");

  const top20Products = productGrouped.map((p) =>
    `- ${p.productName} (${brandMap.get(p.brandId) ?? ""}): GMV ${fmt(Number(p._sum.gmv ?? 0))}, ${p._sum.itemsSold ?? 0} sold`
  ).join("\n");

  const newAffiliatesBlock = newAffiliates.length > 0
    ? `\nNEW AFFILIATES (first time appearing — not in any prior period):\n` +
      newAffiliates.map((c) =>
        `- ${c.name} (${c.brand}): GMV ${fmt(c.gmv)}, ROI ${c.roi ?? "N/A"}x, ${c.liveStreams} lives, ${c.videos} videos, label: ${c.label ?? "none"}`
      ).join("\n")
    : priorPeriods.length === 0
      ? "\nNEW AFFILIATES: Cannot determine — no prior period data to compare against."
      : "\nNEW AFFILIATES: None detected in this period.";

  const contextBlock = `
AFFILIATE DATA CONTEXT
Brand: ${brandLabel}
Period: ${activePeriods.join(", ")} (${activePeriods.length} month${activePeriods.length !== 1 ? "s" : ""})
Prior periods checked for new-affiliate detection: ${priorPeriods.length > 0 ? priorPeriods.join(", ") : "none (this is the first period)"}
Total GMV: ${fmt(totalGmv)}
Total creators: ${creators.length} (${newAffiliates.length} new this period)
Labels — STAR: ${labelCounts.STAR}, A: ${labelCounts.A}, B: ${labelCounts.B}, F (blacklist): ${labelCounts.F}
${newAffiliatesBlock}

TOP 20 CREATORS BY GMV (★ = new affiliate):
${top20Creators || "No creator data"}

TOP 20 PRODUCTS BY GMV:
${top20Products || "No product data"}

All available periods: ${periodList.join(", ")}
`.trim();

  // ── Stream response ──────────────────────────────────────────────────────────
  const stream = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    stream: true,
    system: `You are an affiliate marketing analyst assistant for 13 Media. You answer questions about affiliate creator and product performance using the live data and industry knowledge below. Be concise, data-driven, and actionable. Use RM currency. When listing items, use bullet points. Do not make up data not in the context. When relevant, use the industry benchmarks and strategies from the knowledge base to enrich your answers.\n\n${contextBlock}\n\n${AFFILIATE_KNOWLEDGE}`,
    messages: [
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: message },
    ],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          controller.enqueue(encoder.encode(event.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" },
  });
}
