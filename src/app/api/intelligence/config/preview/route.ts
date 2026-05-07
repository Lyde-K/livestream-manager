import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeBenchmark } from "@/lib/intelligence/benchmarks";
import { DEFAULT_INTELLIGENCE_CONFIG } from "@/lib/intelligence/config";
import { deriveMetrics } from "@/lib/intelligence/derive";
import { evaluateFlags } from "@/lib/intelligence/flags";
import type {
  IntelligenceConfigResolved,
  Platform,
  SessionInput,
  Tier,
} from "@/lib/intelligence/types";
import { validateConfigBody } from "../route";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { role: string };
  if (user.role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as Partial<IntelligenceConfigResolved>;
  const validated = validateConfigBody(body);
  if ("error" in validated) {
    return Response.json({ error: validated.error }, { status: 400 });
  }

  const candidateConfig: IntelligenceConfigResolved = {
    scope: "GLOBAL",
    brandId: null,
    ...DEFAULT_INTELLIGENCE_CONFIG,
    ...validated,
    enabledMetrics: {
      ...DEFAULT_INTELLIGENCE_CONFIG.enabledMetrics,
      ...validated.enabledMetrics,
    },
    configVersion: "preview",
  };

  // Pull the most recent N completed sessions across both platforms
  const since = new Date(
    Date.now() - candidateConfig.cohortDays * 24 * 60 * 60 * 1000,
  );
  const rows = await prisma.session.findMany({
    where: {
      status: "COMPLETED",
      actualEnd: { gte: since },
      actualDurationMinutes: { gte: candidateConfig.excludeMinDurationMinutes },
    },
    select: {
      id: true,
      brandId: true,
      liveHostId: true,
      platform: true,
      actualDurationMinutes: true,
      gmv: true,
      adsCost: true,
      viewers: true,
      peakViewers: true,
      views: true,
      productClicks: true,
      productImpressions: true,
      ctr: true,
      ctor: true,
      addToCart: true,
      ordersConfirmed: true,
      ordersPlaced: true,
      itemsSold: true,
      likes: true,
      shares: true,
      comments: true,
      newFollowers: true,
      avgViewDurationSec: true,
      engagedViewers: true,
    },
    take: 2000,
  });

  // Cache benchmarks per (brandId, platform)
  const benchCache = new Map<string, Awaited<ReturnType<typeof computeBenchmark>>>();
  const tierCounts: Record<Tier, number> = {
    EXCEPTIONAL: 0,
    AVERAGE: 0,
    UNDERPERFORMING: 0,
  };

  for (const r of rows) {
    const platform: Platform = r.platform === "SHOPEE" ? "SHOPEE" : "TIKTOK";
    const key = `${r.brandId}::${platform}`;
    let bench = benchCache.get(key);
    if (!bench) {
      bench = await computeBenchmark(r.brandId, platform, candidateConfig);
      benchCache.set(key, bench);
    }
    const input: SessionInput = {
      id: r.id,
      brandId: r.brandId,
      liveHostId: r.liveHostId ?? "",
      platform,
      actualDurationMinutes: r.actualDurationMinutes,
      gmv: r.gmv,
      adsCost: r.adsCost,
      viewers: r.viewers,
      peakViewers: r.peakViewers,
      views: r.views,
      productClicks: r.productClicks,
      productImpressions: r.productImpressions,
      ctr: r.ctr,
      ctor: r.ctor,
      addToCart: r.addToCart,
      ordersConfirmed: r.ordersConfirmed,
      ordersPlaced: r.ordersPlaced,
      itemsSold: r.itemsSold,
      likes: r.likes,
      shares: r.shares,
      comments: r.comments,
      newFollowers: r.newFollowers,
      avgViewDurationSec: r.avgViewDurationSec,
      engagedViewers: r.engagedViewers,
    };
    const metrics = deriveMetrics(input);
    const evaluated = evaluateFlags(metrics, platform, bench, candidateConfig);
    tierCounts[evaluated.tier] += 1;
  }

  const total = rows.length || 1;
  const distribution = Object.entries(tierCounts).map(([tier, count]) => ({
    tier: tier as Tier,
    count,
    pct: count / total,
  }));

  return Response.json({
    distribution,
    totalSessions: rows.length,
  });
}
