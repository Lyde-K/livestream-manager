export type Platform = "TIKTOK" | "SHOPEE";

export type Tier = "EXCEPTIONAL" | "AVERAGE" | "UNDERPERFORMING";

export type FunnelStage =
  | "TRAFFIC"
  | "ENGAGEMENT"
  | "PRODUCT"
  | "CONVERSION"
  | "AOV"
  | "PROFIT"
  | "NONE";

export type AnalysisDepth = "FULL" | "LIMITED";

export type BenchmarkSource = "BRAND_PLATFORM" | "PLATFORM_FALLBACK";

export type Priority = "HIGH" | "MEDIUM" | "LOW";

export type FlagDirection = "HIGH" | "LOW";

export interface Flag {
  metric: string;
  direction: FlagDirection;
  value: number;
  threshold: number;
  deviation: number;
  source: "PERCENTILE" | "ABSOLUTE";
}

export interface SessionInput {
  id: string;
  brandId: string;
  liveHostId: string;
  platform: Platform;
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
}

export interface DerivedMetrics {
  gmv: number | null;
  durationHours: number | null;
  gmvPerHour: number | null;
  revenuePerViewer: number | null;
  peakStrength: number | null;
  conversionRate: number | null;
  avgViewDurationSec: number | null;

  // TikTok-specific
  customers: number | null;
  customersPerHour: number | null;
  productCtr: number | null;
  clickToOrderRate: number | null;
  profit: number | null;
  roas: number | null;
  profitPerHour: number | null;

  // Shopee-specific
  ordersPerHour: number | null;
  engagementRate: number | null;
  atcRate: number | null;
  atcToOrderRate: number | null;
  aov: number | null;
  itemsPerOrder: number | null;
  revenuePerEngagedViewer: number | null;
}

export interface IntelligenceConfigResolved {
  scope: "GLOBAL" | "BRAND";
  brandId: string | null;
  lowPercentile: number;
  highPercentile: number;
  exceptionalMinTriggers: number;
  underperformingMinTriggers: number;
  tierPrimaryMetric: "gmv" | "gmvPerHour";
  roasLowFloor: number;
  roasHighCeiling: number;
  profitPerHourLowFloor: number;
  limitedAnalysisMinTriggers: number;
  excludeMinDurationMinutes: number;
  enabledMetrics: Record<string, boolean>;
  cohortDays: number;
  cohortMinSize: number;
  configVersion: string;
}

export interface BenchmarkRow {
  metric: string;
  median: number;
  p15: number;
  p85: number;
  sampleSize: number;
}

export interface BenchmarkSet {
  brandId: string | null;
  platform: Platform;
  source: BenchmarkSource;
  asOf: string;
  metrics: Record<string, BenchmarkRow>;
}
