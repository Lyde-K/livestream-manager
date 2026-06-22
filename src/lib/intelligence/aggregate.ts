import { getDiagnosisLibrary } from "./library";
import type { AnalysisResult } from "./analyze";
import type { AnalyzedRow } from "./load";
import type { FunnelStage, Tier } from "./types";

export interface ExecutiveSummary {
  totalSessions: number;
  totalHours: number;
  totalGmv: number;
  totalAdsCost: number;
  avgGmvPerHour: number;
  avgConversionRate: number;
  avgRevenuePerViewer: number;
  avgAov: number;
  avgRoas: number;
  bauSessions: number;
  bauHours: number;
  bauGmv: number;
  campaignSessions: number;
  campaignHours: number;
  campaignGmv: number;
}

export interface PerformanceSplit {
  tier: Tier;
  count: number;
  pct: number;
}

export interface SessionRowSummary {
  sessionId: string;
  tier: Tier;
  gmv: number;
  gmvPerHour: number | null;
  durationHours: number | null;
  viewers: number | null;
  ctor: number | null;
  isCampaignDay: boolean;
  funnelStage: FunnelStage;
  topFlag: string | null;
  brandId: string;
  liveHostId: string;
  platform: "TIKTOK" | "SHOPEE";
}

export interface HostSegmentMetrics {
  sessions: number;
  hours: number;
  gmv: number;
  gmvPerHour: number | null;
}

export interface HostInsight {
  liveHostId: string;
  totalSessions: number;
  totalHours: number;
  totalGmv: number;
  bau: HostSegmentMetrics;
  campaign: HostSegmentMetrics;
  ctorMedian: number | null;
  gmvPerHourMedian: number | null;
  ctorVsBenchmark: number | null; // delta, e.g. +0.012 means 1.2 pp above
  gmvPerHourVsBenchmark: number | null;
  topStrength: string | null;
  topWeakness: string | null;
  exceptionalCount: number;
  underperformingCount: number;
}

export interface BrandInsight {
  brandId: string;
  totalSessions: number;
  totalHours: number;
  totalGmv: number;
  gmvPerHour: number;
  avgViewers: number;
  ctorMedian: number | null;
  bau: HostSegmentMetrics;
  campaign: HostSegmentMetrics;
  topHostId: string | null;
  topHostGmv: number;
  bestSessionId: string | null;
  worstSessionId: string | null;
  exceptionalCount: number;
  underperformingCount: number;
}

export interface KeyInsight {
  text: string;
  weight: number;
  evidence?: string;
}

export interface ActionPriority {
  rank: number;
  funnelStage: FunnelStage;
  affectedSessions: number;
  headline: string;
  topActions: string[];
}

function avg(nums: (number | null)[]): number {
  const valid = nums.filter(
    (n): n is number => n !== null && Number.isFinite(n),
  );
  if (valid.length === 0) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function median(nums: (number | null | undefined)[]): number | null {
  const valid = nums
    .filter(
      (n): n is number => n !== null && n !== undefined && Number.isFinite(n),
    )
    .slice()
    .sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 === 0
    ? (valid[mid - 1] + valid[mid]) / 2
    : valid[mid];
}

function pickTopFlag(r: AnalysisResult): string | null {
  const candidate =
    r.driverFlags[0] ?? r.underperformingFlags[0] ?? r.exceptionalFlags[0];
  return candidate ? candidate.metric : null;
}

function emptySegment(): HostSegmentMetrics {
  return { sessions: 0, hours: 0, gmv: 0, gmvPerHour: null };
}

function buildSegment(rows: AnalyzedRow[]): HostSegmentMetrics {
  if (rows.length === 0) return emptySegment();
  const totalHours = rows.reduce((s, r) => s + (r.durationHours ?? 0), 0);
  const totalGmv = rows.reduce((s, r) => s + r.gmv, 0);
  return {
    sessions: rows.length,
    hours: totalHours,
    gmv: totalGmv,
    gmvPerHour: totalHours > 0 ? totalGmv / totalHours : null,
  };
}

export function buildExecutiveSummary(rows: AnalyzedRow[]): ExecutiveSummary {
  const bauRows = rows.filter((r) => !r.isCampaignDay);
  const campaignRows = rows.filter((r) => r.isCampaignDay);
  const bau = buildSegment(bauRows);
  const campaign = buildSegment(campaignRows);

  return {
    totalSessions: rows.length,
    totalHours: bau.hours + campaign.hours,
    totalGmv: bau.gmv + campaign.gmv,
    totalAdsCost: rows.reduce((s, r) => s + r.adsCost, 0),
    avgGmvPerHour: avg(rows.map((r) => r.result.metrics.gmvPerHour)),
    avgConversionRate: avg(rows.map((r) => r.result.metrics.conversionRate)),
    avgRevenuePerViewer: avg(
      rows.map((r) => r.result.metrics.revenuePerViewer),
    ),
    avgAov: avg(rows.map((r) => r.result.metrics.aov)),
    avgRoas: avg(rows.map((r) => r.result.metrics.roas)),
    bauSessions: bau.sessions,
    bauHours: bau.hours,
    bauGmv: bau.gmv,
    campaignSessions: campaign.sessions,
    campaignHours: campaign.hours,
    campaignGmv: campaign.gmv,
  };
}

export function buildPerformanceSplit(
  results: AnalysisResult[],
): PerformanceSplit[] {
  const tiers: Tier[] = ["EXCEPTIONAL", "AVERAGE", "UNDERPERFORMING"];
  const total = results.length || 1;
  return tiers.map((tier) => {
    const count = results.filter((r) => r.tier === tier).length;
    return { tier, count, pct: count / total };
  });
}

export function buildTopBottomSessions(rows: AnalyzedRow[]): {
  top: SessionRowSummary[];
  bottom: SessionRowSummary[];
} {
  const summaries: SessionRowSummary[] = rows.map((r) => ({
    sessionId: r.result.sessionId,
    tier: r.result.tier,
    gmv: r.gmv,
    gmvPerHour: r.result.metrics.gmvPerHour,
    durationHours: r.durationHours,
    viewers: r.viewers,
    ctor: r.ctor,
    isCampaignDay: r.isCampaignDay,
    funnelStage: r.result.funnelStage,
    topFlag: pickTopFlag(r.result),
    brandId: r.result.brandId,
    liveHostId: r.result.liveHostId,
    platform: r.result.platform,
  }));

  const top = [...summaries].sort((a, b) => b.gmv - a.gmv).slice(0, 5);
  // Exclude sessions shorter than 30 min — likely aborted/restart sessions, not true underperformers
  const bottom = [...summaries]
    .filter(s => s.durationHours == null || s.durationHours >= 0.5)
    .sort((a, b) => a.gmv - b.gmv)
    .slice(0, 5);
  return { top, bottom };
}

export function buildHostLeaderboard(rows: AnalyzedRow[]): HostInsight[] {
  const ctorBenchmark = median(rows.map((r) => r.ctor));
  const gmvPerHourBenchmark = median(
    rows.map((r) => r.result.metrics.gmvPerHour),
  );

  const byHost = new Map<string, AnalyzedRow[]>();
  for (const r of rows) {
    const arr = byHost.get(r.result.liveHostId) ?? [];
    arr.push(r);
    byHost.set(r.result.liveHostId, arr);
  }

  const insights: HostInsight[] = [];
  for (const [liveHostId, items] of byHost) {
    const bau = buildSegment(items.filter((r) => !r.isCampaignDay));
    const campaign = buildSegment(items.filter((r) => r.isCampaignDay));

    const exFlagCounts = new Map<string, number>();
    const unFlagCounts = new Map<string, number>();
    for (const r of items) {
      for (const f of r.result.exceptionalFlags) {
        exFlagCounts.set(f.metric, (exFlagCounts.get(f.metric) ?? 0) + 1);
      }
      for (const f of r.result.underperformingFlags) {
        unFlagCounts.set(f.metric, (unFlagCounts.get(f.metric) ?? 0) + 1);
      }
    }
    const topStrength =
      [...exFlagCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const topWeakness =
      [...unFlagCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const ctorMedian = median(items.map((r) => r.ctor));
    const gmvPerHourMedian = median(
      items.map((r) => r.result.metrics.gmvPerHour),
    );

    insights.push({
      liveHostId,
      totalSessions: items.length,
      totalHours: bau.hours + campaign.hours,
      totalGmv: bau.gmv + campaign.gmv,
      bau,
      campaign,
      ctorMedian,
      gmvPerHourMedian,
      ctorVsBenchmark:
        ctorMedian !== null && ctorBenchmark !== null
          ? ctorMedian - ctorBenchmark
          : null,
      gmvPerHourVsBenchmark:
        gmvPerHourMedian !== null && gmvPerHourBenchmark !== null
          ? gmvPerHourMedian - gmvPerHourBenchmark
          : null,
      topStrength,
      topWeakness,
      exceptionalCount: items.filter((r) => r.result.tier === "EXCEPTIONAL")
        .length,
      underperformingCount: items.filter(
        (r) => r.result.tier === "UNDERPERFORMING",
      ).length,
    });
  }
  return insights.sort((a, b) => b.totalGmv - a.totalGmv);
}

export function buildBrandInsights(rows: AnalyzedRow[]): BrandInsight[] {
  const byBrand = new Map<string, AnalyzedRow[]>();
  for (const r of rows) {
    const arr = byBrand.get(r.result.brandId) ?? [];
    arr.push(r);
    byBrand.set(r.result.brandId, arr);
  }

  const insights: BrandInsight[] = [];
  for (const [brandId, items] of byBrand) {
    const bau = buildSegment(items.filter((r) => !r.isCampaignDay));
    const campaign = buildSegment(items.filter((r) => r.isCampaignDay));
    const totalHours = bau.hours + campaign.hours;
    const totalGmv = bau.gmv + campaign.gmv;

    const sortedByGmv = [...items].sort((a, b) => b.gmv - a.gmv);

    const hostGmvMap = new Map<string, number>();
    for (const r of items) {
      hostGmvMap.set(
        r.result.liveHostId,
        (hostGmvMap.get(r.result.liveHostId) ?? 0) + r.gmv,
      );
    }
    const topHostEntry = [...hostGmvMap.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0];

    insights.push({
      brandId,
      totalSessions: items.length,
      totalHours,
      totalGmv,
      gmvPerHour: totalHours > 0 ? totalGmv / totalHours : 0,
      avgViewers: avg(items.map((r) => r.viewers)),
      ctorMedian: median(items.map((r) => r.ctor)),
      bau,
      campaign,
      topHostId: topHostEntry?.[0] ?? null,
      topHostGmv: topHostEntry?.[1] ?? 0,
      bestSessionId: sortedByGmv[0]?.result.sessionId ?? null,
      worstSessionId: sortedByGmv.at(-1)?.result.sessionId ?? null,
      exceptionalCount: items.filter((r) => r.result.tier === "EXCEPTIONAL")
        .length,
      underperformingCount: items.filter(
        (r) => r.result.tier === "UNDERPERFORMING",
      ).length,
    });
  }

  return insights.sort((a, b) => b.totalGmv - a.totalGmv);
}

export function buildKeyInsights(results: AnalysisResult[]): KeyInsight[] {
  if (results.length === 0) return [];

  const insights: KeyInsight[] = [];
  const total = results.length;

  const stageCounts = new Map<FunnelStage, number>();
  for (const r of results) {
    if (r.tier === "UNDERPERFORMING" || r.priority === "HIGH") {
      stageCounts.set(
        r.funnelStage,
        (stageCounts.get(r.funnelStage) ?? 0) + 1,
      );
    }
  }
  const dominantStage = [...stageCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0];
  if (dominantStage && dominantStage[1] >= 3) {
    insights.push({
      text: `${dominantStage[1]} sessions broke at the ${dominantStage[0].toLowerCase()} stage — the largest single funnel-stage cluster this period.`,
      weight: dominantStage[1],
      evidence: dominantStage[0],
    });
  }

  const exceptionalCount = results.filter(
    (r) => r.tier === "EXCEPTIONAL",
  ).length;
  if (exceptionalCount > 0) {
    insights.push({
      text: `${exceptionalCount} sessions hit the exceptional tier (${Math.round(
        (exceptionalCount / total) * 100,
      )}%) — review their playbook for repeatable patterns.`,
      weight: exceptionalCount,
    });
  }

  const underperformingCount = results.filter(
    (r) => r.tier === "UNDERPERFORMING",
  ).length;
  if (underperformingCount > 0) {
    insights.push({
      text: `${underperformingCount} sessions landed in underperforming (${Math.round(
        (underperformingCount / total) * 100,
      )}%) — these are the highest-leverage interventions.`,
      weight: underperformingCount,
    });
  }

  const limitedCount = results.filter(
    (r) => r.analysisDepth === "LIMITED",
  ).length;
  if (limitedCount / total > 0.2) {
    insights.push({
      text: `${Math.round(
        (limitedCount / total) * 100,
      )}% of sessions had limited engagement data — push hosts to capture full TikTok/Shopee exports.`,
      weight: limitedCount,
    });
  }

  const fallbackCount = results.filter(
    (r) => r.benchmarkSource === "PLATFORM_FALLBACK",
  ).length;
  if (fallbackCount / total > 0.3) {
    insights.push({
      text: `${Math.round(
        (fallbackCount / total) * 100,
      )}% of brands lack a 5-session cohort — benchmarks fell back to platform-wide medians.`,
      weight: fallbackCount,
    });
  }

  return insights.sort((a, b) => b.weight - a.weight).slice(0, 5);
}

export function buildActionPriorities(
  results: AnalysisResult[],
): ActionPriority[] {
  const stageCounts = new Map<FunnelStage, number>();
  for (const r of results) {
    if (r.tier === "UNDERPERFORMING" || r.priority === "HIGH") {
      if (r.funnelStage === "NONE") continue;
      stageCounts.set(
        r.funnelStage,
        (stageCounts.get(r.funnelStage) ?? 0) + 1,
      );
    }
  }

  const sorted = [...stageCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const dominantPlatform = (results[0]?.platform ?? "TIKTOK") as
    | "TIKTOK"
    | "SHOPEE";

  return sorted.map(([stage, count], idx) => {
    const lib = getDiagnosisLibrary(stage, dominantPlatform);
    return {
      rank: idx + 1,
      funnelStage: stage,
      affectedSessions: count,
      headline: lib.headline,
      topActions: lib.actionTemplates.slice(0, 2),
    };
  });
}
