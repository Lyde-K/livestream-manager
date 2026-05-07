import type { EvaluatedFlags } from "./flags";
import type {
  DerivedMetrics,
  Flag,
  FunnelStage,
  Platform,
  Priority,
  Tier,
} from "./types";

export interface Diagnosis {
  funnelStage: FunnelStage;
  priority: Priority;
  driverFlags: Flag[];
}

function has(flags: Flag[], metric: string, direction: "HIGH" | "LOW"): boolean {
  return flags.some(
    (f) => f.metric === metric && f.direction === direction,
  );
}

function pickFlags(
  flags: Flag[],
  metrics: string[],
  direction: "HIGH" | "LOW",
): Flag[] {
  return flags.filter(
    (f) => metrics.includes(f.metric) && f.direction === direction,
  );
}

export function diagnose(
  metrics: DerivedMetrics,
  platform: Platform,
  evaluated: EvaluatedFlags,
): Diagnosis {
  const ex = evaluated.exceptional;
  const un = evaluated.underperforming;

  // 1. Profit issue (TikTok only): healthy GMV per hour but ad cost destroyed margin
  if (
    platform === "TIKTOK" &&
    has(un, "profitPerHour", "LOW") &&
    !has(un, "gmvPerHour", "LOW")
  ) {
    return {
      funnelStage: "PROFIT",
      priority: "HIGH",
      driverFlags: pickFlags(un, ["profitPerHour", "roas"], "LOW"),
    };
  }

  // 2. AOV issue (Shopee only): orders flowing but baskets are small
  if (
    platform === "SHOPEE" &&
    has(un, "aov", "LOW") &&
    !has(un, "ordersPerHour", "LOW")
  ) {
    return {
      funnelStage: "AOV",
      priority: "MEDIUM",
      driverFlags: pickFlags(un, ["aov"], "LOW"),
    };
  }

  // 3. Conversion issue: high traffic-side metrics but low conversion
  const trafficStrong =
    has(ex, "engagementRate", "HIGH") ||
    has(ex, "atcRate", "HIGH") ||
    has(ex, "productCtr", "HIGH") ||
    has(ex, "clickToOrderRate", "HIGH");
  if (trafficStrong && has(un, "conversionRate", "LOW")) {
    return {
      funnelStage: "CONVERSION",
      priority: "HIGH",
      driverFlags: pickFlags(
        un,
        ["conversionRate", "atcToOrderRate"],
        "LOW",
      ),
    };
  }

  // 4. Product issue: engagement strong but product CTR/ATC weak
  if (
    (has(ex, "engagementRate", "HIGH") ||
      (metrics.engagementRate !== null && metrics.engagementRate > 0)) &&
    (has(un, "productCtr", "LOW") || has(un, "atcRate", "LOW"))
  ) {
    return {
      funnelStage: "PRODUCT",
      priority: "MEDIUM",
      driverFlags: pickFlags(un, ["productCtr", "atcRate"], "LOW"),
    };
  }

  // 5. Engagement issue: avg view duration weak
  if (has(un, "avgViewDurationSec", "LOW")) {
    return {
      funnelStage: "ENGAGEMENT",
      priority: "MEDIUM",
      driverFlags: pickFlags(un, ["avgViewDurationSec"], "LOW"),
    };
  }

  // 6. Conversion issue (catch-all): low conversion without other signals
  if (has(un, "conversionRate", "LOW")) {
    return {
      funnelStage: "CONVERSION",
      priority: "HIGH",
      driverFlags: pickFlags(un, ["conversionRate"], "LOW"),
    };
  }

  // 7. Traffic issue: low gmv/hour with no specific funnel-stage signals
  if (
    has(un, "gmvPerHour", "LOW") &&
    !has(un, "conversionRate", "LOW") &&
    !has(un, "avgViewDurationSec", "LOW")
  ) {
    return {
      funnelStage: "TRAFFIC",
      priority: "MEDIUM",
      driverFlags: pickFlags(un, ["gmvPerHour"], "LOW"),
    };
  }

  // 8. Fallback: anything underperforming
  if (un.length > 0) {
    return {
      funnelStage: "TRAFFIC",
      priority: "LOW",
      driverFlags: un.slice(0, 3),
    };
  }

  return {
    funnelStage: "NONE",
    priority: "LOW",
    driverFlags: [],
  };
}

export function priorityFromTier(tier: Tier): Priority {
  if (tier === "UNDERPERFORMING") return "HIGH";
  if (tier === "EXCEPTIONAL") return "LOW";
  return "MEDIUM";
}
