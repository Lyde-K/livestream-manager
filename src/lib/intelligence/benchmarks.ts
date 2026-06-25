import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { mytToday } from "@/lib/utils";
import { deriveMetrics, getPercentileMetricKeys } from "./derive";
import type {
  BenchmarkRow,
  BenchmarkSet,
  IntelligenceConfigResolved,
  Platform,
  SessionInput,
} from "./types";

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

type RawSessionRow = {
  id: string;
  brandId: string;
  liveHostId: string | null;
  platform: string;
  actualDurationMinutes: number | null;
  gmv: number | null;
  adsCost: number | null;
  viewers: number | null;
  peakViewers: number | null;
  views: number | null;
  productClicks: number | null;
  productImpressions: number | null;
  ctr: number | null;
  ctor: number | null;
  addToCart: number | null;
  ordersConfirmed: number | null;
  ordersPlaced: number | null;
  itemsSold: number | null;
  likes: number | null;
  shares: number | null;
  comments: number | null;
  newFollowers: number | null;
  avgViewDurationSec: number | null;
  engagedViewers: number | null;
};

function rowToSessionInput(row: RawSessionRow): SessionInput {
  return {
    id: row.id,
    brandId: row.brandId,
    liveHostId: row.liveHostId ?? "",
    platform: row.platform === "SHOPEE" ? "SHOPEE" : "TIKTOK",
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
}

function buildBenchmarkRows(
  sessions: SessionInput[],
  platform: Platform,
): Record<string, BenchmarkRow> {
  const keys = getPercentileMetricKeys(platform);
  const buckets: Record<string, number[]> = {};
  for (const k of keys) buckets[k] = [];

  for (const s of sessions) {
    const m = deriveMetrics(s);
    const flat = m as unknown as Record<string, number | null>;
    for (const k of keys) {
      const v = flat[k];
      if (v !== null && v !== undefined && Number.isFinite(v)) {
        buckets[k].push(v);
      }
    }
  }

  const result: Record<string, BenchmarkRow> = {};
  for (const k of keys) {
    const arr = buckets[k];
    result[k] = {
      metric: k,
      median: percentile(arr, 0.5),
      p15: percentile(arr, 0.15),
      p85: percentile(arr, 0.85),
      sampleSize: arr.length,
    };
  }
  return result;
}

async function fetchCohortSessions(
  brandId: string | null,
  platform: Platform,
  cohortDays: number,
  excludeMinDurationMinutes: number,
): Promise<SessionInput[]> {
  const since = new Date(Date.now() - cohortDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.session.findMany({
    where: {
      platform,
      status: "COMPLETED",
      actualEnd: { gte: since },
      actualDurationMinutes: { gte: excludeMinDurationMinutes },
      ...(brandId ? { brandId } : {}),
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
  });
  return rows.map(rowToSessionInput);
}

export async function computeBenchmark(
  brandId: string | null,
  platform: Platform,
  config: IntelligenceConfigResolved,
  excludeSessionId?: string,
): Promise<BenchmarkSet> {
  let sessions = await fetchCohortSessions(
    brandId,
    platform,
    config.cohortDays,
    config.excludeMinDurationMinutes,
  );
  let source: "BRAND_PLATFORM" | "PLATFORM_FALLBACK" = "BRAND_PLATFORM";

  if (brandId && sessions.length < config.cohortMinSize) {
    sessions = await fetchCohortSessions(
      null,
      platform,
      config.cohortDays,
      config.excludeMinDurationMinutes,
    );
    source = "PLATFORM_FALLBACK";
  }

  const filtered = excludeSessionId
    ? sessions.filter((s) => s.id !== excludeSessionId)
    : sessions;

  return {
    brandId: source === "PLATFORM_FALLBACK" ? null : brandId,
    platform,
    source,
    asOf: mytToday(),
    metrics: buildBenchmarkRows(filtered, platform),
  };
}

export const getCachedBenchmark = unstable_cache(
  async (
    brandId: string | null,
    platform: Platform,
    config: IntelligenceConfigResolved,
  ) => computeBenchmark(brandId, platform, config),
  ["intelligence-benchmark"],
  { revalidate: 3600 },
);
