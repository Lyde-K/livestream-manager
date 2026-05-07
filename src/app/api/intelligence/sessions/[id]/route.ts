import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzeSession } from "@/lib/intelligence/analyze";
import { computeBenchmark } from "@/lib/intelligence/benchmarks";
import { resolveConfigForBrand } from "@/lib/intelligence/config";
import { narrateSession } from "@/lib/intelligence/narrate";
import { resolveAccessScope } from "@/lib/intelligence/scope";
import type { Platform, SessionInput } from "@/lib/intelligence/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const session = await auth();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  const { id } = await ctx.params;

  const row = await prisma.session.findUnique({
    where: { id },
    include: {
      brand: { select: { id: true, name: true, color: true, platform: true } },
      liveHost: { select: { id: true, displayName: true, type: true } },
      room: { select: { id: true, name: true } },
      insight: true,
    },
  });

  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  if (row.status !== "COMPLETED") {
    return Response.json(
      { error: "Session not yet completed" },
      { status: 400 },
    );
  }

  const scope = await resolveAccessScope(user.id, user.role, {
    brandId: null,
    hostId: null,
  });
  if (scope.role === "CLIENT" && !scope.brandIds?.includes(row.brandId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (scope.role === "LIVE_HOST" && scope.liveHostId !== row.liveHostId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const platform: Platform = row.platform === "SHOPEE" ? "SHOPEE" : "TIKTOK";
  const input: SessionInput = {
    id: row.id,
    brandId: row.brandId,
    liveHostId: row.liveHostId ?? "",
    platform,
    actualDurationMinutes: row.actualDurationMinutes,
    gmv: row.gmv,
    adsCost: row.adsCost,
    viewers: row.viewers,
    peakViewers: row.peakViewers,
    views: row.views,
    productClicks: row.productClicks,
    productImpressions: row.productImpressions,
    ctr: row.ctr,
    ctor: row.ctor,
    addToCart: row.addToCart,
    ordersConfirmed: row.ordersConfirmed,
    ordersPlaced: row.ordersPlaced,
    itemsSold: row.itemsSold,
    likes: row.likes,
    shares: row.shares,
    comments: row.comments,
    newFollowers: row.newFollowers,
    avgViewDurationSec: row.avgViewDurationSec,
    engagedViewers: row.engagedViewers,
  };

  const config = await resolveConfigForBrand(row.brandId);
  const benchmarks = await computeBenchmark(
    row.brandId,
    platform,
    config,
    row.id,
  );
  const result = await analyzeSession(input, { config, benchmarks });

  // Cache hit: existing insight signature matches current
  let narrative: { reasoning: string; causes: string[]; actionPlan: string[] };
  let hasNarrative = false;

  if (
    row.insight &&
    row.insight.signature === result.signature &&
    row.insight.hasNarrative
  ) {
    narrative = {
      reasoning: row.insight.reasoning,
      causes: Array.isArray(row.insight.causes)
        ? (row.insight.causes as string[])
        : [],
      actionPlan: Array.isArray(row.insight.actionPlan)
        ? (row.insight.actionPlan as string[])
        : [],
    };
    hasNarrative = true;
  } else {
    try {
      narrative = await narrateSession(result, benchmarks, {
        grossRevenue: row.grossRevenue,
        inStreamGmv: row.gmv,
      });
      hasNarrative = true;
    } catch (err) {
      // Fallback if Claude is unavailable — keep it plain so a new host can read it
      narrative = {
        reasoning: `This session ended in the ${result.tier.toLowerCase()} group based on GMV.`,
        causes: [],
        actionPlan: [],
      };
      hasNarrative = false;
      if (process.env.NODE_ENV !== "production") {
        console.error("Narration failed:", err);
      }
    }

    await prisma.sessionInsight.upsert({
      where: { sessionId: row.id },
      create: {
        sessionId: row.id,
        score: result.score,
        status: result.tier,
        funnelStage: result.funnelStage,
        flags: [
          ...result.exceptionalFlags,
          ...result.underperformingFlags,
        ] as unknown as object,
        reasoning: narrative.reasoning,
        causes: narrative.causes as unknown as object,
        actionPlan: narrative.actionPlan as unknown as object,
        priority: result.priority,
        analysisDepth: result.analysisDepth,
        benchmarkSource: result.benchmarkSource,
        signature: result.signature,
        hasNarrative,
      },
      update: {
        score: result.score,
        status: result.tier,
        funnelStage: result.funnelStage,
        flags: [
          ...result.exceptionalFlags,
          ...result.underperformingFlags,
        ] as unknown as object,
        reasoning: narrative.reasoning,
        causes: narrative.causes as unknown as object,
        actionPlan: narrative.actionPlan as unknown as object,
        priority: result.priority,
        analysisDepth: result.analysisDepth,
        benchmarkSource: result.benchmarkSource,
        signature: result.signature,
        hasNarrative,
      },
    });
  }

  return Response.json({
    session: {
      id: row.id,
      platform,
      brand: row.brand,
      host: row.liveHost,
      room: row.room,
      actualStart: row.actualStart,
      actualEnd: row.actualEnd,
      actualDurationMinutes: row.actualDurationMinutes,
      gmv: row.gmv,
      adsCost: row.adsCost,
    },
    analysis: {
      score: result.score,
      tier: result.tier,
      funnelStage: result.funnelStage,
      priority: result.priority,
      metrics: result.metrics,
      exceptionalFlags: result.exceptionalFlags,
      underperformingFlags: result.underperformingFlags,
      driverFlags: result.driverFlags,
      analysisDepth: result.analysisDepth,
      benchmarkSource: result.benchmarkSource,
    },
    benchmarks: benchmarks.metrics,
    narrative,
  });
}
