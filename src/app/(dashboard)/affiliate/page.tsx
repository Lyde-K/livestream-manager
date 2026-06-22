"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LabelChip } from "@/components/affiliate/label-chip";
import { formatCurrency } from "@/lib/utils";
import { Handshake, ArrowRight, Ban, TrendingUp, TrendingDown, Video, Radio, ArrowUp, ArrowDown, Calendar, Sparkles } from "lucide-react";
import { MonthRangePicker } from "@/components/ui/month-range-picker";

interface Brand { id: string; name: string; color: string; client: { user: { name: string } } | null; }

interface PeriodSnapshot {
  period: string; gmv: number; estCommission: number; videos: number; liveStreams: number; creators: number; blacklisted: number;
}
interface TopCreator { id: string; creatorName: string; gmv: number; prevGmv: number | null; roi: number | null; label: string | null; brand: { name: string }; }
interface TopProduct { id: string; productName: string; gmv: number; prevGmv: number | null; tier: string | null; brand: { name: string }; }
interface TopLiveCreator { id: string; creatorName: string; liveStreams: number; gmv: number; label: string | null; brand: { name: string }; }
interface TopVideoCreator { id: string; creatorName: string; videos: number; gmv: number; label: string | null; brand: { name: string }; }

interface OverviewData {
  snapshots: PeriodSnapshot[];
  periods: string[];
  activePeriod: string | null;
  prevPeriod: string | null;
  rangeMode: boolean;
  rangeSnapshot: PeriodSnapshot | null;
  rangePeriods: string[];
  topCreators: TopCreator[];
  topProducts: TopProduct[];
  topLiveCreators: TopLiveCreator[];
  topVideoCreators: TopVideoCreator[];
  labelDistribution: Record<string, number>;
  prevLabelDistribution: Record<string, number>;
}

type FilterMode = "month" | "ytd" | "range";

function labelDelta(curr: number, prev: number | undefined) {
  if (prev == null || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function LabelDeltaBadge({ curr, prev }: { curr: number; prev: number | undefined }) {
  const pct = labelDelta(curr, prev);
  if (pct == null) return null;
  const up = pct >= 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded ml-1"
      style={{
        background: up ? "color-mix(in oklab, #10b981 15%, transparent)" : "color-mix(in oklab, #ef4444 15%, transparent)",
        color: up ? "#10b981" : "#ef4444",
      }}
    >
      {up ? <ArrowUp size={8} /> : <ArrowDown size={8} />}
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

function GmvDeltaBadge({ curr, prev }: { curr: number; prev: number | null | undefined }) {
  if (!prev || prev === 0) return null;
  const pct = ((curr - prev) / prev) * 100;
  const up = pct >= 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded whitespace-nowrap flex-shrink-0"
      style={{
        background: up ? "color-mix(in oklab, #10b981 15%, transparent)" : "color-mix(in oklab, #ef4444 15%, transparent)",
        color: up ? "#10b981" : "#ef4444",
      }}
    >
      {up ? <ArrowUp size={8} /> : <ArrowDown size={8} />}
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

const LABEL_EXPLANATIONS: Record<string, { title: string; criteria: string[]; color: string }> = {
  STAR: {
    title: "⭐ Star — Top performer",
    color: "#f59e0b",
    criteria: [
      "Top 10% by GMV among all creators this period",
      "GMV ≥ RM 1,000",
      "ROI ≥ 3x (GMV ÷ Est. Commission)",
      "Consistency ≥ 80% (active in 80%+ of tracked months)",
      "Top-ranked for 3 or more consecutive months",
    ],
  },
  A: {
    title: "A Rank — Strong performer",
    color: "#10b981",
    criteria: [
      "Top 30% by GMV among all creators this period",
      "ROI ≥ 2x (GMV ÷ Est. Commission)",
      "Consistency ≥ 60% (active in 60%+ of tracked months)",
      "Does not qualify for STAR",
    ],
  },
  B: {
    title: "B Rank — Active creator",
    color: "var(--text-secondary)",
    criteria: [
      "GMV > 0 this period",
      "ROI ≥ 1x (earning more than commission paid)",
      "Does not qualify for A or STAR",
    ],
  },
  F: {
    title: "F Rank — Blacklist",
    color: "#ef4444",
    criteria: [
      "Samples were shipped but produced zero content, OR",
      "GMV = 0 despite receiving samples, OR",
      "ROI < 1x (commission paid exceeds GMV earned)",
    ],
  },
};

type AffiliateType = "all" | "live" | "video";

export default function AffiliateOverviewPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState("");
  const [period, setPeriod] = useState("");         // for single-month mode
  const [filterMode, setFilterMode] = useState<FilterMode>("ytd");
  const [customFrom, setCustomFrom] = useState(""); // "YYYY-MM"
  const [customTo, setCustomTo] = useState("");     // "YYYY-MM"
  const [data, setData] = useState<OverviewData | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [affiliateType, setAffiliateType] = useState<AffiliateType>("all");

  useEffect(() => {
    fetch("/api/affiliate/brands")
      .then((r) => r.json())
      .then((d: { brands: Brand[] }) => {
        setBrands(d.brands);
        if (d.brands.length === 1) setBrandId(d.brands[0].id);
      });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (brandId) params.set("brandId", brandId);

    if (filterMode === "ytd") {
      params.set("period", "YTD");
    } else if (filterMode === "range" && customFrom && customTo) {
      params.set("from", customFrom);
      params.set("to", customTo);
    } else if (filterMode === "month" && period) {
      params.set("period", period);
    }

    setData(null);
    fetch(`/api/affiliate/overview?${params}`).then((r) => r.json()).then(setData);
  }, [brandId, filterMode, period, customFrom, customTo]);

  // Sync period from API response on first load
  useEffect(() => {
    if (data?.activePeriod && filterMode === "month" && !period) {
      setPeriod(data.activePeriod);
    }
  }, [data?.activePeriod]); // eslint-disable-line react-hooks/exhaustive-deps

  // The active display snapshot (range or single-month)
  const displaySnapshot = data?.rangeMode
    ? data.rangeSnapshot
    : data?.snapshots.find((s) => s.period === data?.activePeriod);

  const prevSnapshot = !data?.rangeMode && data?.prevPeriod
    ? data.snapshots.find((s) => s.period === data?.prevPeriod)
    : undefined;

  const gmvDelta = displaySnapshot && prevSnapshot && prevSnapshot.gmv > 0
    ? ((displaySnapshot.gmv - prevSnapshot.gmv) / prevSnapshot.gmv) * 100
    : null;
  const videosDelta = displaySnapshot && prevSnapshot && prevSnapshot.videos > 0
    ? ((displaySnapshot.videos - prevSnapshot.videos) / prevSnapshot.videos) * 100
    : null;
  const livesDelta = displaySnapshot && prevSnapshot && prevSnapshot.liveStreams > 0
    ? ((displaySnapshot.liveStreams - prevSnapshot.liveStreams) / prevSnapshot.liveStreams) * 100
    : null;

  // Derive YTD year label from most recent period
  const ytdYear = data?.periods?.length
    ? data.periods[data.periods.length - 1].substring(0, 4)
    : new Date().getFullYear().toString();

  // Derive current period param for "View all" links
  const currentPeriodParam = filterMode === "ytd" ? "YTD"
    : filterMode === "range" && customFrom && customTo ? `${customFrom}..${customTo}`
    : period;
  const _creatorParams = new URLSearchParams();
  if (brandId) _creatorParams.set("brandId", brandId);
  if (currentPeriodParam) _creatorParams.set("period", currentPeriodParam);
  const _productParams = new URLSearchParams();
  if (brandId) _productParams.set("brandId", brandId);
  if (currentPeriodParam) _productParams.set("period", currentPeriodParam);
  const creatorsHref = `/affiliate/creators${_creatorParams.toString() ? `?${_creatorParams}` : ""}`;
  const productsHref = `/affiliate/products${_productParams.toString() ? `?${_productParams}` : ""}`;

  // For type filter: use the pre-filtered lists (live/video) but sort by GMV for ranking accuracy
  const filteredTopCreators = data
    ? affiliateType === "live"
      ? [...data.topLiveCreators].sort((a, b) => b.gmv - a.gmv)
      : affiliateType === "video"
      ? [...data.topVideoCreators].sort((a, b) => b.gmv - a.gmv)
      : data.topCreators
    : [];

  return (
    <div className="space-y-5 animate-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <Handshake size={20} /> Affiliate Overview
        </h1>
        <Link
          href="/affiliate/ai-analysis"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={{ background: "color-mix(in oklab, var(--accent) 12%, var(--bg-subtle))", color: "var(--accent)", border: "1px solid color-mix(in oklab, var(--accent) 30%, transparent)" }}
        >
          <Sparkles size={13} /> AI Analysis
        </Link>
      </div>

      {/* Brand tabs */}
      {brands.length > 1 && (
        <div className="flex items-end gap-0 overflow-x-auto border-b" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={() => { setBrandId(""); setPeriod(""); }}
            className="px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px"
            style={{ borderColor: brandId === "" ? "var(--accent)" : "transparent", color: brandId === "" ? "var(--accent)" : "var(--text-secondary)", background: "transparent" }}
          >
            All brands
          </button>
          {brands.map((b) => (
            <button
              key={b.id}
              onClick={() => { setBrandId(b.id); setPeriod(""); }}
              className="px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px flex items-center gap-1.5"
              style={{ borderColor: brandId === b.id ? "var(--accent)" : "transparent", color: brandId === b.id ? "var(--accent)" : "var(--text-secondary)", background: "transparent" }}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: b.color }} />
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* Period filter — mode switcher + controls */}
      {data && (data.periods?.length ?? 0) > 0 && (
        <div className="section-card p-3 flex flex-wrap items-start gap-3">
          {/* Mode buttons */}
          <div className="flex gap-1">
            {(["month", "ytd", "range"] as FilterMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setFilterMode(m)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
                style={{
                  background: filterMode === m ? "var(--accent)" : "var(--bg-subtle)",
                  color: filterMode === m ? "#fff" : "var(--text-secondary)",
                }}
              >
                {m === "month" ? "Monthly" : m === "ytd" ? `📅 YTD ${ytdYear}` : "Custom range"}
              </button>
            ))}
          </div>

          {/* Monthly pill selector */}
          {filterMode === "month" && (
            <div className="flex gap-1 flex-wrap flex-1">
              {[...data.periods].reverse().map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                  style={{
                    background: period === p ? "var(--accent)" : "var(--bg-subtle)",
                    color: period === p ? "#fff" : "var(--text-secondary)",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* YTD info */}
          {filterMode === "ytd" && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
              <Calendar size={13} />
              Aggregating {data.rangePeriods?.length ?? 0} months of {ytdYear}
            </div>
          )}

          {/* Affiliate type filter */}
          <div className="flex gap-1 ml-auto">
            {(["all", "live", "video"] as AffiliateType[]).map((t) => (
              <button
                key={t}
                onClick={() => setAffiliateType(t)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
                style={{
                  background: affiliateType === t ? "var(--accent)" : "var(--bg-subtle)",
                  color: affiliateType === t ? "#fff" : "var(--text-secondary)",
                }}
              >
                {t === "all" ? "All" : t === "live" ? "🔴 Livestream" : "🎬 Videos"}
              </button>
            ))}
          </div>

          {/* Custom range picker */}
          {filterMode === "range" && data.periods.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <MonthRangePicker
                from={customFrom}
                to={customTo}
                minPeriod={data.periods[0]}
                maxPeriod={data.periods[data.periods.length - 1]}
                onChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }}
              />
              {customFrom && customTo && data.rangePeriods?.length > 0 && (
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {data.rangePeriods.length} month{data.rangePeriods.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {!data && (
        <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>
      )}

      {data && !displaySnapshot && (
        <div className="section-card p-10 text-center">
          <Handshake size={32} className="mx-auto opacity-30 mb-3" />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Import affiliate data first to see overview.</p>
          <Link href="/affiliate/import" className="inline-flex items-center gap-1 mt-3 text-sm font-semibold" style={{ color: "var(--accent)" }}>
            Go to import <ArrowRight size={14} />
          </Link>
        </div>
      )}

      {data && displaySnapshot && (
        <>
          {/* Range mode label */}
          {data.rangeMode && (
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
              <Calendar size={13} />
              <span>
                Showing aggregated data for{" "}
                <strong style={{ color: "var(--text-secondary)" }}>
                  {data.rangePeriods.join(", ")}
                </strong>
                {" "}· Label distribution as of {data.rangePeriods[data.rangePeriods.length - 1]}
              </span>
            </div>
          )}

          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="GMV" value={formatCurrency(displaySnapshot.gmv)} fullValue={formatCurrency(displaySnapshot.gmv)} delta={gmvDelta} />
            <KpiCard label="Est. Commission" value={formatCurrency(displaySnapshot.estCommission)} fullValue={formatCurrency(displaySnapshot.estCommission)} delta={null} />
            <KpiCard label="Videos" value={displaySnapshot.videos.toLocaleString()} fullValue={displaySnapshot.videos.toLocaleString()} delta={videosDelta} />
            <KpiCard label="Live streams" value={displaySnapshot.liveStreams.toLocaleString()} fullValue={displaySnapshot.liveStreams.toLocaleString()} delta={livesDelta} />
          </div>

          {/* Label distribution */}
          {Object.keys(data.labelDistribution).length > 0 && (
            <div className="section-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Creator labels
                  {data.rangeMode
                    ? ` — as of ${data.rangePeriods[data.rangePeriods.length - 1]}`
                    : ` — ${data.activePeriod}`}
                </div>
                {!data.rangeMode && data.prevPeriod && (
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>vs {data.prevPeriod}</div>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(["STAR", "A", "B", "F"] as const).map((l) => {
                  const curr = data.labelDistribution[l] ?? 0;
                  const prev = data.prevLabelDistribution[l];
                  const active = selectedLabel === l;
                  return (
                    <button
                      key={l}
                      onClick={() => setSelectedLabel(active ? null : l)}
                      className="rounded-lg p-3 text-left cursor-pointer transition-all"
                      style={{
                        background: active ? "color-mix(in oklab, var(--accent) 10%, var(--bg-subtle))" : "var(--bg-subtle)",
                        outline: active ? "1.5px solid var(--accent)" : "1.5px solid transparent",
                      }}
                    >
                      <LabelChip label={l} showTooltip={false} />
                      <div className="flex items-baseline gap-1 mt-2">
                        <span className="text-xl font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{curr.toLocaleString()}</span>
                        {!data.rangeMode && prev != null && <LabelDeltaBadge curr={curr} prev={prev} />}
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>creators · click for info</div>
                    </button>
                  );
                })}
              </div>

              {/* Label explanation panel */}
              {selectedLabel && LABEL_EXPLANATIONS[selectedLabel] && (() => {
                const info = LABEL_EXPLANATIONS[selectedLabel];
                return (
                  <div className="mt-3 rounded-lg p-4 border" style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold" style={{ color: info.color }}>{info.title}</div>
                      <button onClick={() => setSelectedLabel(null)} className="text-xs px-2 py-0.5 rounded cursor-pointer" style={{ color: "var(--text-muted)" }}>✕</button>
                    </div>
                    <ul className="space-y-1">
                      {info.criteria.map((c, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                          <span className="mt-0.5 flex-shrink-0" style={{ color: info.color }}>•</span>
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Period trend table */}
          {data.snapshots.length > 1 && (
            <div className="section-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Month-over-month</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>{data.snapshots.length} months</div>
              </div>
              <div className="overflow-x-auto -mx-px">
                <table className="w-full text-sm">
                  <thead style={{ background: "var(--bg-subtle)" }}>
                    <tr>
                      <th className="px-2 sm:px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Period</th>
                      <th className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>GMV</th>
                      <th className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>Videos</th>
                      <th className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>Lives</th>
                      <th className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Blacklist</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.snapshots].reverse().map((s) => {
                      const inRange = data.rangeMode && data.rangePeriods.includes(s.period);
                      const isActive = !data.rangeMode && s.period === data.activePeriod;
                      return (
                        <tr
                          key={s.period}
                          className="border-t cursor-pointer transition-colors"
                          style={{
                            borderColor: "var(--border)",
                            background: isActive
                              ? "color-mix(in oklab, var(--accent) 8%, transparent)"
                              : inRange
                              ? "color-mix(in oklab, var(--accent) 4%, transparent)"
                              : "transparent",
                          }}
                          onClick={() => { setFilterMode("month"); setPeriod(s.period); }}
                        >
                          <td className="px-2 sm:px-3 py-2 font-medium tabular-nums" style={{ color: isActive || inRange ? "var(--accent)" : "var(--text-primary)" }}>
                            {s.period}
                            {inRange && <span className="ml-1.5 text-[10px] opacity-60">✓</span>}
                          </td>
                          <td className="px-2 sm:px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{formatCurrency(s.gmv)}</td>
                          <td className="px-2 sm:px-3 py-2 text-right tabular-nums hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>{s.videos.toLocaleString()}</td>
                          <td className="px-2 sm:px-3 py-2 text-right tabular-nums hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>{s.liveStreams.toLocaleString()}</td>
                          <td className="px-2 sm:px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: s.blacklisted > 0 ? "#ef4444" : "var(--text-muted)" }}>
                            <span className="inline-flex items-center gap-1 justify-end">
                              {s.blacklisted > 0 && <Ban size={11} />}
                              {s.blacklisted}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top GMV creators + products */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="section-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Top 10 creators by GMV
                  {data.rangeMode && <span className="ml-1 text-xs font-normal" style={{ color: "var(--text-muted)" }}>(aggregated)</span>}
                </div>
                <Link href={creatorsHref} className="text-xs flex items-center gap-1" style={{ color: "var(--accent)" }}>
                  View all <ArrowRight size={11} />
                </Link>
              </div>
              <div className="space-y-0">
                {filteredTopCreators.map((c, i) => (
                  <Link
                    key={c.id}
                    href={`/affiliate/creators/${encodeURIComponent(c.creatorName)}`}
                    className="flex items-center gap-2 py-1.5 border-t hover:bg-[var(--bg-subtle)] -mx-1 px-1 rounded transition-colors"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span className="font-mono text-xs w-5 flex-shrink-0" style={{ color: "var(--text-muted)" }}>#{i + 1}</span>
                    <LabelChip label={c.label} />
                    <span className="flex-1 truncate font-medium text-sm" style={{ color: "var(--text-primary)" }}>{c.creatorName}</span>
                    {affiliateType === "all" && !data.rangeMode && "prevGmv" in c && <GmvDeltaBadge curr={c.gmv} prev={(c as { prevGmv: number | null }).prevGmv} />}
                    <span className="font-mono tabular-nums text-sm whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{formatCurrency(c.gmv)}</span>
                  </Link>
                ))}
                {filteredTopCreators.length === 0 && (
                  <div className="text-sm py-4" style={{ color: "var(--text-muted)" }}>No creator data.</div>
                )}
              </div>
            </div>

            <div className="section-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Top 10 products by GMV
                  {data.rangeMode && <span className="ml-1 text-xs font-normal" style={{ color: "var(--text-muted)" }}>(aggregated)</span>}
                </div>
                <Link href={productsHref} className="text-xs flex items-center gap-1" style={{ color: "var(--accent)" }}>
                  View all <ArrowRight size={11} />
                </Link>
              </div>
              <div className="space-y-0">
                {data.topProducts.map((p, i) => (
                  <Link
                    key={p.id}
                    href={`/affiliate/products/${encodeURIComponent(p.id)}`}
                    className="flex items-center gap-2 py-1.5 border-t hover:bg-[var(--bg-subtle)] -mx-1 px-1 rounded transition-colors"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span className="font-mono text-xs w-5 flex-shrink-0" style={{ color: "var(--text-muted)" }}>#{i + 1}</span>
                    <span className="flex-1 truncate font-medium text-sm" style={{ color: "var(--text-primary)" }} title={p.productName}>{p.productName}</span>
                    {!data.rangeMode && <GmvDeltaBadge curr={p.gmv} prev={p.prevGmv} />}
                    <span className="font-mono tabular-nums text-sm whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{formatCurrency(p.gmv)}</span>
                  </Link>
                ))}
                {data.topProducts.length === 0 && (
                  <div className="text-sm py-4" style={{ color: "var(--text-muted)" }}>No product data.</div>
                )}
              </div>
            </div>
          </div>

          {/* Top live + video creators — hidden when type filter is active */}
          {affiliateType === "all" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="section-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                  <Radio size={14} style={{ color: "var(--accent)" }} /> Top 10 by Live streams
                  {data.rangeMode && <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>(aggregated)</span>}
                </div>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{data.activePeriod}</span>
              </div>
              <div className="space-y-0">
                {data.topLiveCreators.map((c, i) => (
                  <Link
                    key={c.id}
                    href={`/affiliate/creators/${encodeURIComponent(c.creatorName)}`}
                    className="flex items-center gap-2 py-1.5 border-t hover:bg-[var(--bg-subtle)] -mx-1 px-1 rounded transition-colors"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span className="font-mono text-xs w-5 flex-shrink-0" style={{ color: "var(--text-muted)" }}>#{i + 1}</span>
                    <LabelChip label={c.label} />
                    <span className="flex-1 truncate font-medium text-sm" style={{ color: "var(--text-primary)" }}>{c.creatorName}</span>
                    <span className="font-mono tabular-nums text-xs whitespace-nowrap mr-1" style={{ color: "var(--text-secondary)" }}>{formatCurrency(c.gmv)}</span>
                    <span className="font-mono tabular-nums text-sm whitespace-nowrap font-semibold" style={{ color: "var(--accent)" }}>{c.liveStreams}</span>
                    <span className="text-xs whitespace-nowrap hidden sm:inline" style={{ color: "var(--text-muted)" }}>lives</span>
                  </Link>
                ))}
                {data.topLiveCreators.length === 0 && (
                  <div className="text-sm py-4" style={{ color: "var(--text-muted)" }}>No livestream data.</div>
                )}
              </div>
            </div>

            <div className="section-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                  <Video size={14} style={{ color: "var(--accent)" }} /> Top 10 by Videos
                  {data.rangeMode && <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>(aggregated)</span>}
                </div>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{data.activePeriod}</span>
              </div>
              <div className="space-y-0">
                {data.topVideoCreators.map((c, i) => (
                  <Link
                    key={c.id}
                    href={`/affiliate/creators/${encodeURIComponent(c.creatorName)}`}
                    className="flex items-center gap-2 py-1.5 border-t hover:bg-[var(--bg-subtle)] -mx-1 px-1 rounded transition-colors"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span className="font-mono text-xs w-5 flex-shrink-0" style={{ color: "var(--text-muted)" }}>#{i + 1}</span>
                    <LabelChip label={c.label} />
                    <span className="flex-1 truncate font-medium text-sm" style={{ color: "var(--text-primary)" }}>{c.creatorName}</span>
                    <span className="font-mono tabular-nums text-xs whitespace-nowrap mr-1" style={{ color: "var(--text-secondary)" }}>{formatCurrency(c.gmv)}</span>
                    <span className="font-mono tabular-nums text-sm whitespace-nowrap font-semibold" style={{ color: "var(--accent)" }}>{c.videos}</span>
                    <span className="text-xs whitespace-nowrap hidden sm:inline" style={{ color: "var(--text-muted)" }}>vids</span>
                  </Link>
                ))}
                {data.topVideoCreators.length === 0 && (
                  <div className="text-sm py-4" style={{ color: "var(--text-muted)" }}>No video data.</div>
                )}
              </div>
            </div>
          </div>
          )}
        </>
      )}
    </div>
  );
}

interface KpiProps { label: string; value: string; fullValue: string; delta: number | null }
function KpiCard({ label, value, fullValue, delta }: KpiProps) {
  const showDelta = delta != null && Number.isFinite(delta);
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="section-card p-3 sm:p-4 min-w-0">
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-base sm:text-lg lg:text-xl font-bold mt-1 whitespace-nowrap tabular-nums" style={{ color: "var(--text-primary)" }} title={fullValue}>{value}</div>
      {showDelta && (
        <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: positive ? "#10b981" : "#ef4444" }}>
          {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {Math.abs(delta!).toFixed(1)}% MoM
        </div>
      )}
    </div>
  );
}
