import { createHash } from "node:crypto";
import { computeBenchmark } from "./benchmarks";
import { resolveConfigForBrand } from "./config";
import { deriveMetrics } from "./derive";
import { diagnose, priorityFromTier } from "./diagnose";
import { evaluateFlags } from "./flags";
import { computeScore } from "./score";
import type {
  AnalysisDepth,
  BenchmarkSet,
  DerivedMetrics,
  Flag,
  FunnelStage,
  IntelligenceConfigResolved,
  Platform,
  Priority,
  SessionInput,
  Tier,
} from "./types";

export interface AnalysisResult {
  sessionId: string;
  platform: Platform;
  brandId: string;
  liveHostId: string;
  metrics: DerivedMetrics;
  exceptionalFlags: Flag[];
  underperformingFlags: Flag[];
  tier: Tier;
  funnelStage: FunnelStage;
  priority: Priority;
  driverFlags: Flag[];
  score: number;
  analysisDepth: AnalysisDepth;
  benchmarkSource: "BRAND_PLATFORM" | "PLATFORM_FALLBACK";
  signature: string;
}

function computeSignature(
  benchmarks: BenchmarkSet,
  config: IntelligenceConfigResolved,
): string {
  const benchSnap = JSON.stringify({
    source: benchmarks.source,
    brandId: benchmarks.brandId,
    platform: benchmarks.platform,
    asOf: benchmarks.asOf,
    metrics: Object.entries(benchmarks.metrics)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [
        k,
        Math.round(v.median * 1000) / 1000,
        Math.round(v.p15 * 1000) / 1000,
        Math.round(v.p85 * 1000) / 1000,
        v.sampleSize,
      ]),
  });
  return createHash("sha256")
    .update(`${config.configVersion}::${benchSnap}`)
    .digest("hex")
    .slice(0, 16);
}

export async function analyzeSession(
  session: SessionInput,
  options?: {
    config?: IntelligenceConfigResolved;
    benchmarks?: BenchmarkSet;
  },
): Promise<AnalysisResult> {
  const config =
    options?.config ?? (await resolveConfigForBrand(session.brandId));

  const benchmarks =
    options?.benchmarks ??
    (await computeBenchmark(
      session.brandId,
      session.platform,
      config,
      session.id,
    ));

  const metrics = deriveMetrics(session);
  const evaluated = evaluateFlags(metrics, session.platform, benchmarks, config);
  const dx = diagnose(metrics, session.platform, evaluated);
  const score = computeScore({
    exceptionalFlags: evaluated.exceptional,
    underperformingFlags: evaluated.underperforming,
    roas: metrics.roas,
  });

  const signature = computeSignature(benchmarks, config);

  // Priority lifts when tier is bad even if no specific flag-driven priority
  const priorityFromDx = dx.priority;
  const priorityFromTierVal = priorityFromTier(evaluated.tier);
  const priority: Priority =
    evaluated.tier === "UNDERPERFORMING" || priorityFromDx === "HIGH"
      ? "HIGH"
      : priorityFromDx === "MEDIUM" || priorityFromTierVal === "MEDIUM"
        ? "MEDIUM"
        : "LOW";

  return {
    sessionId: session.id,
    platform: session.platform,
    brandId: session.brandId,
    liveHostId: session.liveHostId,
    metrics,
    exceptionalFlags: evaluated.exceptional,
    underperformingFlags: evaluated.underperforming,
    tier: evaluated.tier,
    funnelStage: dx.funnelStage,
    priority,
    driverFlags: dx.driverFlags,
    score,
    analysisDepth: evaluated.analysisDepth,
    benchmarkSource: benchmarks.source,
    signature,
  };
}

export async function analyzeMany(
  sessions: SessionInput[],
): Promise<AnalysisResult[]> {
  // Group by (brandId, platform) so we share benchmark + config lookups
  const groups = new Map<string, SessionInput[]>();
  for (const s of sessions) {
    const key = `${s.brandId}::${s.platform}`;
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }

  const results: AnalysisResult[] = [];
  for (const [key, group] of groups) {
    const [brandId, platform] = key.split("::") as [string, Platform];
    const config = await resolveConfigForBrand(brandId);
    const benchmarks = await computeBenchmark(brandId, platform, config);
    for (const s of group) {
      const r = await analyzeSession(s, { config, benchmarks });
      results.push(r);
    }
  }
  return results;
}
