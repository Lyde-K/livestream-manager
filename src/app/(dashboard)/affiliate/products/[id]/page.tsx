"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { ArrowLeft, ArrowUp, ArrowDown, Package } from "lucide-react";

const TIER_STYLES: Record<string, { bg: string; fg: string; text: string }> = {
  EXCEPTIONAL: { bg: "color-mix(in oklab, #10b981 18%, transparent)", fg: "#059669", text: "Exceptional" },
  AVERAGE: { bg: "var(--bg-subtle)", fg: "var(--text-secondary)", text: "Average" },
  UNDERPERFORMING: { bg: "color-mix(in oklab, #ef4444 16%, transparent)", fg: "#ef4444", text: "Under" },
};

function TierChip({ tier }: { tier: string | null }) {
  if (!tier) return null;
  const s = TIER_STYLES[tier] ?? TIER_STYLES.AVERAGE;
  return (
    <span className="inline-flex items-center rounded-md font-semibold text-[10px] px-1.5 py-0.5 leading-tight whitespace-nowrap" style={{ background: s.bg, color: s.fg }}>
      {s.text}
    </span>
  );
}

function calcDelta(current: number, prev: number | undefined): number | null {
  if (prev == null || prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  const up = pct >= 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1 py-0.5 rounded"
      style={{
        background: up ? "color-mix(in oklab, #10b981 15%, transparent)" : "color-mix(in oklab, #ef4444 15%, transparent)",
        color: up ? "#10b981" : "#ef4444",
      }}
    >
      {up ? <ArrowUp size={9} /> : <ArrowDown size={9} />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

interface BrandRef { id: string; name: string; color: string }

interface HistoryRow {
  id: string;
  period: string;
  gmv: number;
  refunds: number;
  itemsSold: number;
  itemsRefunded: number;
  attributedOrders: number;
  videos: number;
  liveStreams: number;
  estCommission: number;
  samplesShipped: number;
  roi: number | null;
  tier: string | null;
  category: string | null;
}

interface ProductData {
  productId: string;
  productName: string;
  brand: BrandRef;
  history: HistoryRow[];
}

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<ProductData | null>(null);

  const backHref = (() => {
    if (typeof window === "undefined") return "/affiliate/products";
    const sp = new URLSearchParams(window.location.search);
    const qs = sp.toString();
    return `/affiliate/products${qs ? `?${qs}` : ""}`;
  })();

  useEffect(() => {
    fetch(`/api/affiliate/products/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then(setData);
  }, [id]);

  if (!data) return <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>;

  if (data.history.length === 0) {
    return (
      <div className="space-y-4 animate-in">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          <ArrowLeft size={14} /> Back to products
        </Link>
        <div className="section-card p-10 text-center">
          <Package size={32} className="mx-auto opacity-30 mb-3" />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No data found for this product.</p>
        </div>
      </div>
    );
  }

  const latest = data.history[data.history.length - 1];
  const totalGmv = data.history.reduce((s, h) => s + h.gmv, 0);
  const totalItems = data.history.reduce((s, h) => s + h.itemsSold, 0);

  return (
    <div className="space-y-5 animate-in">
      <Link href={backHref} className="inline-flex items-center gap-1 text-sm" style={{ color: "var(--text-secondary)" }}>
        <ArrowLeft size={14} /> Back to products
      </Link>

      {/* Header */}
      <div className="flex items-start gap-3 flex-wrap">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--bg-subtle)" }}
        >
          <Package size={18} style={{ color: "var(--accent)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold leading-tight" style={{ color: "var(--text-primary)" }}>{data.productName}</h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              <span className="w-2 h-2 rounded-full" style={{ background: data.brand.color }} />
              {data.brand.name}
            </span>
            {latest.category && (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{latest.category}</span>
            )}
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>ID: {data.productId}</span>
          </div>
        </div>
        <TierChip tier={latest.tier} />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Cumulative GMV" value={formatCurrency(totalGmv)} title={formatCurrency(totalGmv)} highlight />
        <Kpi label="Latest GMV" value={formatCurrency(latest.gmv)} title={formatCurrency(latest.gmv)} />
        <Kpi label="Total Items Sold" value={totalItems.toLocaleString()} />
        <Kpi label="Months tracked" value={String(data.history.length)} />
      </div>

      {/* Monthly trend table */}
      <div className="section-card p-4">
        <div className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Monthly performance</div>
        <div className="overflow-x-auto -mx-px">
          <table className="w-full text-sm">
            <thead style={{ background: "var(--bg-subtle)" }}>
              <tr>
                <th title="Reporting month in YYYY-MM format." className="px-2 sm:px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide cursor-help" style={{ color: "var(--text-secondary)" }}>Period</th>
                <th title="Product GMV tier for this month. Platinum: top 10%, Gold: top 30%, Silver: active but below top 30%, Bronze: low or zero GMV." className="px-2 sm:px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide cursor-help" style={{ color: "var(--text-secondary)" }}>Tier</th>
                <th title="Gross Merchandise Value — total sales (RM) generated by this product this month." className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide cursor-help" style={{ color: "var(--text-secondary)" }}>GMV</th>
                <th title="Month-over-Month change in GMV vs the previous month. Green = growth, red = decline." className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide cursor-help" style={{ color: "var(--text-secondary)" }}>MoM</th>
                <th title="Number of units sold this month." className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide hidden sm:table-cell cursor-help" style={{ color: "var(--text-secondary)" }}>Items Sold</th>
                <th title="GMV ÷ Est. Commission — revenue generated per RM paid in commission for this product this month." className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide hidden sm:table-cell cursor-help" style={{ color: "var(--text-secondary)" }}>ROI</th>
                <th title="Creator videos featuring this product this month." className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide hidden md:table-cell cursor-help" style={{ color: "var(--text-secondary)" }}>Videos</th>
                <th title="Live streams featuring this product this month." className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide hidden md:table-cell cursor-help" style={{ color: "var(--text-secondary)" }}>Lives</th>
              </tr>
            </thead>
            <tbody>
              {[...data.history].reverse().map((h, i, arr) => {
                const prev = arr[i + 1];
                const delta = calcDelta(h.gmv, prev?.gmv);
                return (
                  <tr key={h.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-2 sm:px-3 py-2 font-mono tabular-nums whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{h.period}</td>
                    <td className="px-2 sm:px-3 py-2"><TierChip tier={h.tier} /></td>
                    <td className="px-2 sm:px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{formatCurrency(h.gmv)}</td>
                    <td className="px-2 sm:px-3 py-2 text-right whitespace-nowrap"><DeltaBadge pct={delta} /></td>
                    <td className="px-2 sm:px-3 py-2 text-right tabular-nums hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>{h.itemsSold.toLocaleString()}</td>
                    <td className="px-2 sm:px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap hidden sm:table-cell" style={{ color: h.roi != null && h.roi >= 2 ? "#10b981" : h.roi != null && h.roi < 1 ? "#ef4444" : "var(--text-secondary)" }}>
                      {h.roi != null ? `${h.roi.toFixed(1)}x` : "—"}
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-right tabular-nums hidden md:table-cell" style={{ color: "var(--text-secondary)" }}>{h.videos}</td>
                    <td className="px-2 sm:px-3 py-2 text-right tabular-nums hidden md:table-cell" style={{ color: "var(--text-secondary)" }}>{h.liveStreams}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, title, highlight }: { label: string; value: string; title?: string; highlight?: boolean }) {
  return (
    <div className="section-card p-3 min-w-0" style={highlight ? { outline: "1.5px solid var(--accent)", outlineOffset: "-1.5px" } : {}}>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div
        className="text-base sm:text-lg font-bold mt-0.5 whitespace-nowrap tabular-nums"
        style={{ color: highlight ? "var(--accent)" : "var(--text-primary)" }}
        title={title}
      >
        {value}
      </div>
    </div>
  );
}
