import type { DerivedMetrics, SessionInput } from "./types";

function safeDiv(num: number | null, den: number | null): number | null {
  if (num === null || den === null) return null;
  if (!Number.isFinite(num) || !Number.isFinite(den)) return null;
  if (den === 0) return null;
  return num / den;
}

function safeMul(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a * b;
}

function safeSub(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a - b;
}

export function deriveMetrics(session: SessionInput): DerivedMetrics {
  const durationHours = safeDiv(session.actualDurationMinutes, 60);

  const gmvPerHour = safeDiv(session.gmv, durationHours);
  const revenuePerViewer = safeDiv(session.gmv, session.viewers);
  const peakStrength = safeDiv(session.peakViewers, session.viewers);
  const avgViewDurationSec = session.avgViewDurationSec;

  // TikTok: customers = round(productClicks × ctor)
  const customersRaw = safeMul(session.productClicks, session.ctor);
  const customers =
    customersRaw === null ? null : Math.max(0, Math.round(customersRaw));
  const customersPerHour = safeDiv(customers, durationHours);

  // Conversion rate — different denominators per platform's intent
  const conversionRate =
    session.platform === "TIKTOK"
      ? safeDiv(customers, session.viewers)
      : safeDiv(session.ordersConfirmed, session.viewers);

  const productCtr = session.ctr;
  const clickToOrderRate = session.ctor;

  const profit = safeSub(session.gmv, session.adsCost);
  const roas = safeDiv(session.gmv, session.adsCost);
  const profitPerHour = safeDiv(profit, durationHours);

  // Shopee
  const ordersPerHour = safeDiv(session.ordersConfirmed, durationHours);
  const engagementRate = safeDiv(session.engagedViewers, session.viewers);
  const atcRate = safeDiv(session.addToCart, session.viewers);
  const atcToOrderRate = safeDiv(session.ordersConfirmed, session.addToCart);
  const aov = safeDiv(session.gmv, session.ordersConfirmed);
  const itemsPerOrder = safeDiv(session.itemsSold, session.ordersConfirmed);
  const revenuePerEngagedViewer = safeDiv(
    session.gmv,
    session.engagedViewers,
  );

  return {
    gmv: session.gmv,
    durationHours,
    gmvPerHour,
    revenuePerViewer,
    peakStrength,
    conversionRate,
    avgViewDurationSec,
    customers,
    customersPerHour,
    productCtr,
    clickToOrderRate,
    profit,
    roas,
    profitPerHour,
    ordersPerHour,
    engagementRate,
    atcRate,
    atcToOrderRate,
    aov,
    itemsPerOrder,
    revenuePerEngagedViewer,
  };
}

export const TIKTOK_PERCENTILE_METRICS = [
  "gmv",
  "gmvPerHour",
  "conversionRate",
  "avgViewDurationSec",
  "productCtr",
  "clickToOrderRate",
  "revenuePerViewer",
  "customersPerHour",
] as const;

export const SHOPEE_PERCENTILE_METRICS = [
  "gmv",
  "gmvPerHour",
  "conversionRate",
  "avgViewDurationSec",
  "engagementRate",
  "atcRate",
  "atcToOrderRate",
  "revenuePerViewer",
  "aov",
  "ordersPerHour",
  "revenuePerEngagedViewer",
] as const;

export function getPercentileMetricKeys(
  platform: "TIKTOK" | "SHOPEE",
): readonly string[] {
  return platform === "TIKTOK"
    ? TIKTOK_PERCENTILE_METRICS
    : SHOPEE_PERCENTILE_METRICS;
}
