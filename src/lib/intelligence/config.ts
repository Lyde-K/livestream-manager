import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { IntelligenceConfigResolved } from "./types";

const DEFAULT_ENABLED_METRICS: Record<string, boolean> = {
  gmvPerHour: true,
  conversionRate: true,
  avgViewDurationSec: true,
  productCtr: true,
  clickToOrderRate: true,
  revenuePerViewer: true,
  customersPerHour: true,
  engagementRate: true,
  atcRate: true,
  atcToOrderRate: true,
  aov: true,
  ordersPerHour: true,
  revenuePerEngagedViewer: true,
};

export const DEFAULT_INTELLIGENCE_CONFIG = {
  lowPercentile: 0.2,
  highPercentile: 0.8,
  exceptionalMinTriggers: 1,
  underperformingMinTriggers: 1,
  tierPrimaryMetric: "gmv" as const,
  roasLowFloor: 1.5,
  roasHighCeiling: 5.0,
  profitPerHourLowFloor: 0,
  limitedAnalysisMinTriggers: 1,
  excludeMinDurationMinutes: 5,
  cohortDays: 90,
  cohortMinSize: 5,
  enabledMetrics: DEFAULT_ENABLED_METRICS,
};

export function computeConfigVersion(
  config: Omit<
    IntelligenceConfigResolved,
    "configVersion" | "scope" | "brandId"
  >,
): string {
  const ordered = JSON.stringify(config, Object.keys(config).sort());
  return createHash("sha256").update(ordered).digest("hex").slice(0, 16);
}

type IntelligenceConfigRow = {
  scope: string;
  brandId: string | null;
  lowPercentile: number;
  highPercentile: number;
  exceptionalMinTriggers: number;
  underperformingMinTriggers: number;
  goodMinTriggers: number;
  mixedMinEachSide: number;
  enableMixedTier: boolean;
  roasLowFloor: number;
  roasHighCeiling: number;
  profitPerHourLowFloor: number;
  limitedAnalysisMinTriggers: number;
  excludeMinDurationMinutes: number;
  enabledMetrics: unknown;
  cohortDays: number;
  cohortMinSize: number;
  configVersion: string;
};

function rowToResolved(
  row: IntelligenceConfigRow,
): IntelligenceConfigResolved {
  const enabledMetrics =
    typeof row.enabledMetrics === "object" &&
    row.enabledMetrics !== null &&
    !Array.isArray(row.enabledMetrics)
      ? (row.enabledMetrics as Record<string, boolean>)
      : {};

  const merged = { ...DEFAULT_ENABLED_METRICS, ...enabledMetrics };

  return {
    scope: row.scope === "BRAND" ? "BRAND" : "GLOBAL",
    brandId: row.brandId,
    lowPercentile: row.lowPercentile,
    highPercentile: row.highPercentile,
    exceptionalMinTriggers: row.exceptionalMinTriggers,
    underperformingMinTriggers: row.underperformingMinTriggers,
    tierPrimaryMetric: "gmv",
    roasLowFloor: row.roasLowFloor,
    roasHighCeiling: row.roasHighCeiling,
    profitPerHourLowFloor: row.profitPerHourLowFloor,
    limitedAnalysisMinTriggers: row.limitedAnalysisMinTriggers,
    excludeMinDurationMinutes: row.excludeMinDurationMinutes,
    enabledMetrics: merged,
    cohortDays: row.cohortDays,
    cohortMinSize: row.cohortMinSize,
    configVersion: row.configVersion,
  };
}

function defaultsAsResolved(): IntelligenceConfigResolved {
  const base = {
    scope: "GLOBAL" as const,
    brandId: null,
    ...DEFAULT_INTELLIGENCE_CONFIG,
    configVersion: "",
  };
  const version = computeConfigVersion(base);
  return { ...base, configVersion: version };
}

export async function ensureGlobalConfigSeeded(): Promise<IntelligenceConfigResolved> {
  const existing = await prisma.intelligenceConfig.findFirst({
    where: { scope: "GLOBAL" },
  });

  if (existing) return rowToResolved(existing as IntelligenceConfigRow);

  const defaults = defaultsAsResolved();
  const created = await prisma.intelligenceConfig.create({
    data: {
      scope: "GLOBAL",
      brandId: null,
      lowPercentile: defaults.lowPercentile,
      highPercentile: defaults.highPercentile,
      exceptionalMinTriggers: defaults.exceptionalMinTriggers,
      underperformingMinTriggers: defaults.underperformingMinTriggers,
      roasLowFloor: defaults.roasLowFloor,
      roasHighCeiling: defaults.roasHighCeiling,
      profitPerHourLowFloor: defaults.profitPerHourLowFloor,
      limitedAnalysisMinTriggers: defaults.limitedAnalysisMinTriggers,
      excludeMinDurationMinutes: defaults.excludeMinDurationMinutes,
      enabledMetrics: defaults.enabledMetrics,
      cohortDays: defaults.cohortDays,
      cohortMinSize: defaults.cohortMinSize,
      configVersion: defaults.configVersion,
    },
  });
  return rowToResolved(created as IntelligenceConfigRow);
}

export async function resolveConfigForBrand(
  brandId: string | null,
): Promise<IntelligenceConfigResolved> {
  const global = await ensureGlobalConfigSeeded();
  if (!brandId) return global;

  const override = await prisma.intelligenceConfig.findUnique({
    where: { scope_brandId: { scope: "BRAND", brandId } },
  });

  if (!override) return global;
  return rowToResolved(override as IntelligenceConfigRow);
}

export async function getAllConfigs(): Promise<{
  global: IntelligenceConfigResolved;
  brandOverrides: IntelligenceConfigResolved[];
}> {
  const global = await ensureGlobalConfigSeeded();
  const overrides = await prisma.intelligenceConfig.findMany({
    where: { scope: "BRAND" },
  });
  return {
    global,
    brandOverrides: overrides.map((o) =>
      rowToResolved(o as IntelligenceConfigRow),
    ),
  };
}
