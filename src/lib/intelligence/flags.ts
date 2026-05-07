import { getPercentileMetricKeys } from "./derive";
import type {
  AnalysisDepth,
  BenchmarkSet,
  DerivedMetrics,
  Flag,
  IntelligenceConfigResolved,
  Platform,
  Tier,
} from "./types";

export interface EvaluatedFlags {
  exceptional: Flag[];
  underperforming: Flag[];
  tier: Tier;
  analysisDepth: AnalysisDepth;
  totalEvaluated: number;
}

function getMetricValue(
  metrics: DerivedMetrics,
  key: string,
): number | null {
  const v = (metrics as unknown as Record<string, number | null>)[key];
  if (v === null || v === undefined) return null;
  if (!Number.isFinite(v)) return null;
  return v;
}

function deviation(value: number, threshold: number): number {
  if (threshold === 0) return 0;
  return (value - threshold) / Math.abs(threshold);
}

function evaluatePercentileMetric(
  metricKey: string,
  metrics: DerivedMetrics,
  benchmarks: BenchmarkSet,
): { high?: Flag; low?: Flag } {
  const value = getMetricValue(metrics, metricKey);
  if (value === null) return {};

  const bench = benchmarks.metrics[metricKey];
  if (!bench) return {};

  const result: { high?: Flag; low?: Flag } = {};
  if (value >= bench.p85) {
    result.high = {
      metric: metricKey,
      direction: "HIGH",
      value,
      threshold: bench.p85,
      deviation: deviation(value, bench.p85),
      source: "PERCENTILE",
    };
  }
  if (value <= bench.p15) {
    result.low = {
      metric: metricKey,
      direction: "LOW",
      value,
      threshold: bench.p15,
      deviation: deviation(value, bench.p15),
      source: "PERCENTILE",
    };
  }
  return result;
}

function evaluateAbsoluteFlags(
  metrics: DerivedMetrics,
  platform: Platform,
  config: IntelligenceConfigResolved,
): { exceptional: Flag[]; underperforming: Flag[] } {
  const exceptional: Flag[] = [];
  const underperforming: Flag[] = [];

  if (platform !== "TIKTOK") {
    return { exceptional, underperforming };
  }

  const roas = metrics.roas;
  if (roas !== null) {
    if (roas < config.roasLowFloor) {
      underperforming.push({
        metric: "roas",
        direction: "LOW",
        value: roas,
        threshold: config.roasLowFloor,
        deviation: deviation(roas, config.roasLowFloor),
        source: "ABSOLUTE",
      });
    }
    if (roas >= config.roasHighCeiling) {
      exceptional.push({
        metric: "roas",
        direction: "HIGH",
        value: roas,
        threshold: config.roasHighCeiling,
        deviation: deviation(roas, config.roasHighCeiling),
        source: "ABSOLUTE",
      });
    }
  }

  const pph = metrics.profitPerHour;
  if (pph !== null && pph < config.profitPerHourLowFloor) {
    underperforming.push({
      metric: "profitPerHour",
      direction: "LOW",
      value: pph,
      threshold: config.profitPerHourLowFloor,
      deviation: deviation(pph, config.profitPerHourLowFloor),
      source: "ABSOLUTE",
    });
  }

  return { exceptional, underperforming };
}

function determineAnalysisDepth(
  metrics: DerivedMetrics,
  platform: Platform,
): AnalysisDepth {
  const richSignals =
    platform === "TIKTOK"
      ? [
          metrics.productCtr,
          metrics.clickToOrderRate,
          metrics.customersPerHour,
          metrics.revenuePerViewer,
        ]
      : [
          metrics.engagementRate,
          metrics.atcRate,
          metrics.atcToOrderRate,
          metrics.aov,
        ];

  const present = richSignals.filter((s) => s !== null).length;
  return present >= 2 ? "FULL" : "LIMITED";
}

/**
 * GMV-anchored tier resolution.
 *
 * The session's GMV is compared to the cohort GMV benchmark (p15/p85 or
 * whatever percentiles the config dictates).
 *
 *   - GMV >= p85 (top 20%) → EXCEPTIONAL
 *   - GMV <= p15 (bottom 20%) → UNDERPERFORMING
 *   - else → AVERAGE
 *
 * Other metrics still produce flags, but they are explanatory only — they
 * answer "why is GMV high/low" rather than determine the tier itself.
 */
function resolveTier(
  metrics: DerivedMetrics,
  benchmarks: BenchmarkSet,
  config: IntelligenceConfigResolved,
): Tier {
  // Sessions under 30 min are likely error/restart sessions — keep them AVERAGE
  if (metrics.durationHours != null && metrics.durationHours < 0.5) {
    return "AVERAGE";
  }

  const primaryKey = config.tierPrimaryMetric;
  const value = getMetricValue(metrics, primaryKey);
  const bench = benchmarks.metrics[primaryKey];

  if (value === null || !bench) return "AVERAGE";

  if (value >= bench.p85) return "EXCEPTIONAL";
  if (value <= bench.p15) return "UNDERPERFORMING";
  return "AVERAGE";
}

export function evaluateFlags(
  metrics: DerivedMetrics,
  platform: Platform,
  benchmarks: BenchmarkSet,
  config: IntelligenceConfigResolved,
): EvaluatedFlags {
  const exceptional: Flag[] = [];
  const underperforming: Flag[] = [];

  const metricKeys = getPercentileMetricKeys(platform);
  let totalEvaluated = 0;

  for (const key of metricKeys) {
    if (config.enabledMetrics[key] === false) continue;
    const { high, low } = evaluatePercentileMetric(key, metrics, benchmarks);
    if (high || low) totalEvaluated++;
    if (high) exceptional.push(high);
    if (low) underperforming.push(low);
  }

  const absolute = evaluateAbsoluteFlags(metrics, platform, config);
  exceptional.push(...absolute.exceptional);
  underperforming.push(...absolute.underperforming);

  const depth = determineAnalysisDepth(metrics, platform);
  const tier = resolveTier(metrics, benchmarks, config);

  return {
    exceptional,
    underperforming,
    tier,
    analysisDepth: depth,
    totalEvaluated,
  };
}
