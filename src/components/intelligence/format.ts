export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatNum(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export function formatCompactCurrency(value: number): string {
  if (value >= 1_000_000) return `RM ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `RM ${(value / 1_000).toFixed(1)}k`;
  return `RM ${Math.round(value).toLocaleString("en-US")}`;
}

export function formatHours(hours: number | null | undefined, digits = 1): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours))
    return "—";
  return `${hours.toFixed(digits)}h`;
}

export function metricLabel(metric: string): string {
  const map: Record<string, string> = {
    gmvPerHour: "GMV / hour",
    conversionRate: "Conversion rate",
    avgViewDurationSec: "Avg view duration",
    productCtr: "Product CTR",
    clickToOrderRate: "Click-to-order rate",
    revenuePerViewer: "Revenue / viewer",
    customersPerHour: "Customers / hour",
    engagementRate: "Engagement rate",
    atcRate: "Add-to-cart rate",
    atcToOrderRate: "ATC-to-order rate",
    aov: "Average order value",
    ordersPerHour: "Orders / hour",
    revenuePerEngagedViewer: "Revenue / engaged viewer",
    roas: "ROAS",
    profitPerHour: "Profit / hour",
  };
  return map[metric] ?? metric;
}

export function tierColor(tier: string): {
  bg: string;
  text: string;
  label: string;
} {
  switch (tier) {
    case "EXCEPTIONAL":
      return {
        bg: "var(--success-light)",
        text: "var(--success-text)",
        label: "Exceptional",
      };
    case "AVERAGE":
      return {
        bg: "var(--bg-subtle)",
        text: "var(--text-secondary)",
        label: "Average",
      };
    case "UNDERPERFORMING":
      return {
        bg: "var(--danger-light)",
        text: "var(--danger-text)",
        label: "Underperforming",
      };
    default:
      return {
        bg: "var(--bg-subtle)",
        text: "var(--text-secondary)",
        label: tier,
      };
  }
}

export function funnelLabel(stage: string): string {
  const map: Record<string, string> = {
    TRAFFIC: "Traffic",
    ENGAGEMENT: "Engagement",
    PRODUCT: "Product",
    CONVERSION: "Conversion",
    AOV: "Basket size",
    PROFIT: "Profit margin",
    NONE: "Balanced",
  };
  return map[stage] ?? stage;
}
