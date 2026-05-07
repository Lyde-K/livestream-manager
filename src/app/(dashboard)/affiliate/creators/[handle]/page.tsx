"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { LabelChip } from "@/components/affiliate/label-chip";
import { formatCurrency } from "@/lib/utils";
import { ArrowLeft, ArrowUp, ArrowDown, User } from "lucide-react";

interface BrandRef { id: string; name: string; color: string }

interface HistoryRow {
  id: string;
  period: string;
  brand: BrandRef;
  gmv: number;
  estCommission: number;
  roi: number | null;
  videos: number;
  liveStreams: number;
  samplesShipped: number;
  rank: number | null;
  label: string | null;
}

interface BrandSummary {
  brand: BrandRef;
  months: number;
  totalGmv: number;
  totalCommission: number;
  totalVideos: number;
  totalLives: number;
  totalSamples: number;
  latestLabel: string | null;
  latestPeriod: string;
}

interface ProfileData {
  creatorName: string;
  isAdmin: boolean;
  history: HistoryRow[];
  byBrand: BrandSummary[];
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

export default function CreatorProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);
  const [data, setData] = useState<ProfileData | null>(null);

  useEffect(() => {
    fetch(`/api/affiliate/creators/${encodeURIComponent(handle)}`)
      .then((r) => r.json())
      .then(setData);
  }, [handle]);

  if (!data) return <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>;

  if (data.history.length === 0) {
    return (
      <div className="space-y-4 animate-in">
        <Link href="/affiliate/creators" className="inline-flex items-center gap-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          <ArrowLeft size={14} /> Back to creators
        </Link>
        <div className="section-card p-10 text-center">
          <User size={32} className="mx-auto opacity-30 mb-3" />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            No data found for <strong>{decodeURIComponent(handle)}</strong>.
          </p>
        </div>
      </div>
    );
  }

  const totalAcrossBrands = data.byBrand.reduce((s, b) => s + b.totalGmv, 0);
  const totalCommission = data.byBrand.reduce((s, b) => s + b.totalCommission, 0);

  // Per-brand sorted asc for MoM delta computation
  const brandHistMap = new Map<string, HistoryRow[]>();
  for (const row of data.history) {
    const arr = brandHistMap.get(row.brand.id) ?? [];
    arr.push(row);
    brandHistMap.set(row.brand.id, arr);
  }
  for (const [id, arr] of brandHistMap) {
    brandHistMap.set(id, [...arr].sort((a, b) => a.period.localeCompare(b.period)));
  }

  // Map rowId → MoM GMV delta within same brand
  const deltaMap = new Map<string, number | null>();
  for (const arr of brandHistMap.values()) {
    for (let i = 0; i < arr.length; i++) {
      deltaMap.set(arr[i].id, calcDelta(arr[i].gmv, arr[i - 1]?.gmv));
    }
  }

  const histDesc = [...data.history].sort((a, b) => b.period.localeCompare(a.period) || a.brand.id.localeCompare(b.brand.id));

  return (
    <div className="space-y-5 animate-in">
      <Link href="/affiliate/creators" className="inline-flex items-center gap-1 text-sm" style={{ color: "var(--text-secondary)" }}>
        <ArrowLeft size={14} /> Back to creators
      </Link>

      <div className="flex items-start gap-3 flex-wrap">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold text-white flex-shrink-0"
          style={{ background: "var(--accent)" }}
        >
          {data.creatorName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{data.creatorName}</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {data.history.length} months · {data.byBrand.length} {data.byBrand.length === 1 ? "brand" : "brands"}
          </p>
        </div>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Cumulative GMV" value={formatCurrency(totalAcrossBrands)} title={formatCurrency(totalAcrossBrands)} highlight />
        <Kpi label="Total Commission" value={formatCurrency(totalCommission)} title={formatCurrency(totalCommission)} />
        <Kpi label="Months Active" value={String(data.history.length)} />
        <Kpi label="Brands" value={String(data.byBrand.length)} />
      </div>

      {/* Per-brand cumulative breakdown */}
      <div className="section-card p-4">
        <div className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
          {data.byBrand.length > 1 ? "Per-brand cumulative" : "Cumulative by brand"}
        </div>
        <div className="overflow-x-auto -mx-px">
          <table className="w-full text-sm">
            <thead style={{ background: "var(--bg-subtle)" }}>
              <tr>
                <th className="px-2 sm:px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Brand</th>
                <th title="Total sales (RM) generated with this brand across all tracked months." className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide cursor-help" style={{ color: "var(--text-secondary)" }}>Cumulative GMV</th>
                <th title="Number of months this creator was active (had content or sales) with this brand." className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide hidden sm:table-cell cursor-help" style={{ color: "var(--text-secondary)" }}>Months</th>
                <th title="Total shoppable video posts across all months with this brand." className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide hidden sm:table-cell cursor-help" style={{ color: "var(--text-secondary)" }}>Videos</th>
                <th title="Total live streams across all months with this brand." className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide hidden sm:table-cell cursor-help" style={{ color: "var(--text-secondary)" }}>Lives</th>
                <th title="Most recent label (tier) assigned for this brand. Click any label badge for full tier criteria." className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide cursor-help" style={{ color: "var(--text-secondary)" }}>Latest</th>
              </tr>
            </thead>
            <tbody>
              {data.byBrand.map((b) => (
                <tr key={b.brand.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-2 sm:px-3 py-2 font-medium" style={{ color: "var(--text-primary)" }}>
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: b.brand.color }} />
                    {b.brand.name}
                  </td>
                  <td className="px-2 sm:px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap font-semibold" style={{ color: "var(--accent)" }}>{formatCurrency(b.totalGmv)}</td>
                  <td className="px-2 sm:px-3 py-2 text-right tabular-nums hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>{b.months}</td>
                  <td className="px-2 sm:px-3 py-2 text-right tabular-nums hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>{b.totalVideos}</td>
                  <td className="px-2 sm:px-3 py-2 text-right tabular-nums hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>{b.totalLives}</td>
                  <td className="px-2 sm:px-3 py-2 text-right whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <LabelChip label={b.latestLabel} />
                      <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>{b.latestPeriod}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly history with MoM trend */}
      <div className="section-card p-4">
        <div className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Monthly performance</div>
        <div className="overflow-x-auto -mx-px">
          <table className="w-full text-sm">
            <thead style={{ background: "var(--bg-subtle)" }}>
              <tr>
                <th title="Reporting month in YYYY-MM format." className="px-2 sm:px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide cursor-help" style={{ color: "var(--text-secondary)" }}>Period</th>
                {data.byBrand.length > 1 && (
                  <th className="px-2 sm:px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>Brand</th>
                )}
                <th title="Creator tier for this month. STAR: top 10% GMV ≥ RM1,000, ROI ≥ 3x, consistency ≥ 80%, top-ranked 3+ consecutive months. A: top 30%, ROI ≥ 2x, consistency ≥ 60%. B: positive GMV, ROI ≥ 1x. F: zero content/GMV or ROI < 1x." className="px-2 sm:px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide cursor-help" style={{ color: "var(--text-secondary)" }}>Label</th>
                <th title="Gross Merchandise Value — total sales (RM) generated this month." className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide cursor-help" style={{ color: "var(--text-secondary)" }}>GMV</th>
                <th title="Month-over-Month change in GMV vs the previous month for the same brand. Green = growth, red = decline." className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide cursor-help" style={{ color: "var(--text-secondary)" }}>MoM</th>
                <th title="Return on Investment = GMV ÷ Est. Commission this month. Green ≥ 2x, red < 1x." className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide cursor-help" style={{ color: "var(--text-secondary)" }}>ROI</th>
                <th title="Shoppable video posts uploaded this month." className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide hidden sm:table-cell cursor-help" style={{ color: "var(--text-secondary)" }}>Videos</th>
                <th title="Live streams hosted this month." className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide hidden sm:table-cell cursor-help" style={{ color: "var(--text-secondary)" }}>Lives</th>
                <th title="Sample units received this month — the cost basis for ROI calculation." className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide hidden md:table-cell cursor-help" style={{ color: "var(--text-secondary)" }}>Samples</th>
              </tr>
            </thead>
            <tbody>
              {histDesc.map((h) => (
                <tr key={h.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-2 sm:px-3 py-2 font-mono tabular-nums whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{h.period}</td>
                  {data.byBrand.length > 1 && (
                    <td className="px-2 sm:px-3 py-2 text-xs hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>{h.brand.name}</td>
                  )}
                  <td className="px-2 sm:px-3 py-2"><LabelChip label={h.label} /></td>
                  <td className="px-2 sm:px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{formatCurrency(h.gmv)}</td>
                  <td className="px-2 sm:px-3 py-2 text-right whitespace-nowrap">
                    <DeltaBadge pct={deltaMap.get(h.id) ?? null} />
                  </td>
                  <td className="px-2 sm:px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap" style={{ color: h.roi != null && h.roi >= 2 ? "#10b981" : h.roi != null && h.roi < 1 ? "#ef4444" : "var(--text-secondary)" }}>
                    {h.roi != null ? `${h.roi.toFixed(1)}x` : "—"}
                  </td>
                  <td className="px-2 sm:px-3 py-2 text-right tabular-nums hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>{h.videos}</td>
                  <td className="px-2 sm:px-3 py-2 text-right tabular-nums hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>{h.liveStreams}</td>
                  <td className="px-2 sm:px-3 py-2 text-right tabular-nums hidden md:table-cell" style={{ color: "var(--text-secondary)" }}>{h.samplesShipped}</td>
                </tr>
              ))}
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
