import { prisma } from "@/lib/prisma";
import { analyzeMany, type AnalysisResult } from "./analyze";
import type { AccessScope, DateRange } from "./scope";
import type { Platform, SessionInput } from "./types";

export interface LoadedSession {
  raw: {
    id: string;
    brandId: string;
    liveHostId: string | null;
    platform: Platform;
    gmv: number;
    grossRevenue: number | null;
    adsCost: number;
    actualEnd: Date | null;
    actualStart: Date | null;
    actualDurationMinutes: number | null;
    isCampaignDay: boolean;
    viewers: number | null;
    ctor: number | null;
  };
  input: SessionInput;
}

export async function loadSessionsForScope(
  scope: AccessScope,
  range: DateRange,
  platform?: "TIKTOK" | "SHOPEE",
): Promise<LoadedSession[]> {
  if (scope.role === "CLIENT" && (scope.brandIds?.length ?? 0) === 0) {
    return [];
  }
  if (scope.role === "LIVE_HOST" && !scope.liveHostId) {
    return [];
  }

  const rows = await prisma.session.findMany({
    where: {
      status: "COMPLETED",
      actualEnd: { gte: range.from, lte: range.to },
      ...(scope.brandIds && scope.brandIds.length > 0
        ? { brandId: { in: scope.brandIds } }
        : {}),
      ...(scope.liveHostId ? { liveHostId: scope.liveHostId } : {}),
      ...(platform ? { platform } : {}),
    },
    select: {
      id: true,
      brandId: true,
      liveHostId: true,
      platform: true,
      actualStart: true,
      actualEnd: true,
      actualDurationMinutes: true,
      isCampaignDay: true,
      gmv: true,
      grossRevenue: true,
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
  });

  return rows.map((r) => ({
    raw: {
      id: r.id,
      brandId: r.brandId,
      liveHostId: r.liveHostId,
      platform: (r.platform === "SHOPEE" ? "SHOPEE" : "TIKTOK") as Platform,
      gmv: r.gmv ?? 0,
      grossRevenue: r.grossRevenue ?? null,
      adsCost: r.adsCost ?? 0,
      actualEnd: r.actualEnd,
      actualStart: r.actualStart,
      actualDurationMinutes: r.actualDurationMinutes,
      isCampaignDay: r.isCampaignDay,
      viewers: r.viewers,
      ctor: r.ctor,
    },
    input: {
      id: r.id,
      brandId: r.brandId,
      liveHostId: r.liveHostId ?? "",
      platform: (r.platform === "SHOPEE" ? "SHOPEE" : "TIKTOK") as Platform,
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
    },
  }));
}

export interface AnalyzedRow {
  result: AnalysisResult;
  gmv: number;
  grossRevenue: number | null;
  adsCost: number;
  durationHours: number | null;
  isCampaignDay: boolean;
  viewers: number | null;
  ctor: number | null;
}

export async function analyzeLoaded(
  loaded: LoadedSession[],
): Promise<{
  results: AnalysisResult[];
  rows: AnalyzedRow[];
}> {
  const results = await analyzeMany(loaded.map((l) => l.input));
  const byId = new Map(results.map((r) => [r.sessionId, r]));
  const rows = loaded
    .map((l): AnalyzedRow | null => {
      const result = byId.get(l.raw.id);
      if (!result) return null;
      const durationHours =
        l.raw.actualDurationMinutes !== null
          ? l.raw.actualDurationMinutes / 60
          : null;
      return {
        result,
        gmv: l.raw.gmv,
        grossRevenue: l.raw.grossRevenue,
        adsCost: l.raw.adsCost,
        durationHours,
        isCampaignDay: l.raw.isCampaignDay,
        viewers: l.raw.viewers,
        ctor: l.raw.ctor,
      };
    })
    .filter((r): r is AnalyzedRow => r !== null);
  return { results, rows };
}
