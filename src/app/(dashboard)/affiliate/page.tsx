"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LabelChip } from "@/components/affiliate/label-chip";
import { formatCurrency } from "@/lib/utils";
import { Handshake, ArrowRight, Ban, TrendingUp, TrendingDown, Video, Radio, ArrowUp, ArrowDown, Calendar, Sparkles, ChevronDown, Package } from "lucide-react";
import { MonthRangePicker } from "@/components/ui/month-range-picker";
import { Skeleton } from "@/components/ui/skeleton";

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

interface ProductOption { productId: string; productName: string; gmv: number; }

export default function AffiliateOverviewPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState("");
  const [period, setPeriod] = useState("");         // for single-month mode
  const [filterMode, setFilterMode] = useState<FilterMode>("month");
  const [customFrom, setCustomFrom] = useState(""); // "YYYY-MM"
  const [customTo, setCustomTo] = useState("");     // "YYYY-MM"
  const [data, setData] = useState<OverviewData | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [affiliateType, setAffiliateType] = useState<AffiliateType>("all");
  const cache = useRef<Map<string, OverviewData>>(new Map());

  // Product filter state
  const [allProducts, setAllProducts] = useState<ProductOption[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const productPickerRef = useRef<HTMLDivElement>(null);

  // Close product picker on outside click
  useEffect(() => {
    if (!productPickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (productPickerRef.current && !productPickerRef.current.contains(e.target as Node)) {
        setProductPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [productPickerOpen]);

  // Fetch products for the active period/range
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
    // Reset selection when context changes
    setSelectedProductIds([]);
    fetch(`/api/affiliate/products-for-period?${params}`)
      .then((r) => r.json())
      .then((d: { products?: ProductOption[] }) => {
        if (d.products) setAllProducts(d.products);
      })
      .catch(() => { /* silent */ });
  }, [brandId, filterMode, period, customFrom, customTo]);

  useEffect(() => {
    fetch("/api/affiliate/brands")
      .then((r) => r.json())
      .then((d: { brands?: Brand[] }) => {
        if (d.brands) {
          setBrands(d.brands);
          if (d.brands.length === 1) setBrandId(d.brands[0].id);
        }
      })
      .catch(() => { /* brands fetch failed silently */ });
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
    if (affiliateType !== "all") params.set("type", affiliateType);

    const cacheKey = params.toString();

    // Serve from cache instantly — no Neon hit
    const cached = cache.current.get(cacheKey);
    if (cached) {
      setData(cached);
      setDataError(null);
      return;
    }

    setData(null);
    setDataError(null);

    let cancelled = false;

    async function fetchWithRetry(url: string, attempts = 3): Promise<void> {
      for (let i = 0; i < attempts; i++) {
        try {
          if (i > 0) await new Promise(res => setTimeout(res, 1000 * 2 ** (i - 1)));
          const r = await fetch(url);
          const d = await r.json() as OverviewData & { error?: string; message?: string };
          if (cancelled) return;
          if (d.error || d.message) {
            if (i < attempts - 1) continue;
            setDataError(d.error ?? d.message ?? "Unknown error");
          } else {
            cache.current.set(cacheKey, d);
            setData(d);
          }
          return;
        } catch {
          if (cancelled) return;
          if (i === attempts - 1) setDataError("Failed to load data — check your connection");
        }
      }
    }

    fetchWithRetry(`/api/affiliate/overview?${params}`);
    return () => { cancelled = true; };
  }, [brandId, filterMode, period, customFrom, customTo, affiliateType, retryKey]);

  // Sync period from API response on first load
  useEffect(() => {
    if (data?.activePeriod && filterMode === "month" && !period) {
      setPeriod(data.activePeriod);
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // The active display snapshot (range or single-month)
  const displaySnapshot = data?.rangeMode
    ? data.rangeSnapshot
    : data?.snapshots?.find((s) => s.period === data?.activePeriod);

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
  if (affiliateType !== "all") _creatorParams.set("type", affiliateType);
  const _productParams = new URLSearchParams();
  if (brandId) _productParams.set("brandId", brandId);
  if (currentPeriodParam) _productParams.set("period", currentPeriodParam);
  const creatorsHref = `/affiliate/creators${_creatorParams.toString() ? `?${_creatorParams}` : ""}`;
  const productsHref = `/affiliate/products${_productParams.toString() ? `?${_productParams}` : ""}`;

  function creatorHref(name: string) {
    const qs = _creatorParams.toString();
    return `/affiliate/creators/${encodeURIComponent(name)}${qs ? `?${qs}` : ""}`;
  }
  function productHref(id: string) {
    const qs = _productParams.toString();
    return `/affiliate/products/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`;
  }

  // For type filter: use the pre-filtered lists (live/video) but sort by GMV for ranking accuracy
  const filteredTopCreators = data
    ? affiliateType === "live"
      ? [...data.topLiveCreators].sort((a, b) => b.gmv - a.gmv)
      : affiliateType === "video"
      ? [...data.topVideoCreators].sort((a, b) => b.gmv - a.gmv)
      : data.topCreators
    : [];

  // Product filter derived values
  const filteredProducts = selectedProductIds.length > 0
    ? allProducts.filter((p) => selectedProductIds.includes(p.productId))
    : allProducts;

  const filteredProductGmv = selectedProductIds.length > 0
    ? allProducts.filter((p) => selectedProductIds.includes(p.productId)).reduce((s, p) => s + p.gmv, 0)
    : displaySnapshot?.gmv ?? 0;

  const gmvKpiValue = selectedProductIds.length > 0 ? filteredProductGmv : (displaySnapshot?.gmv ?? 0);

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
          {/* Mode buttons — Custom range integrates the picker trigger */}
          <div className="flex gap-1 flex-wrap items-center">
            <button
              onClick={() => setFilterMode("month")}
              className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
              style={{ background: filterMode === "month" ? "var(--accent)" : "var(--bg-subtle)", color: filterMode === "month" ? "#fff" : "var(--text-secondary)" }}
            >
              Monthly
            </button>
            <button
              onClick={() => setFilterMode("ytd")}
              className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
              style={{ background: filterMode === "ytd" ? "var(--accent)" : "var(--bg-subtle)", color: filterMode === "ytd" ? "#fff" : "var(--text-secondary)" }}
            >
              📅 YTD {ytdYear}
            </button>

            {/* Custom range: clicking sets mode AND opens picker inline */}
            <div className="relative">
              <MonthRangePicker
                from={customFrom}
                to={customTo}
                minPeriod={data.periods[0]}
                maxPeriod={data.periods[data.periods.length - 1]}
                isActive={filterMode === "range"}
                onActivate={() => setFilterMode("range")}
                onChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }}
              />
            </div>

            {filterMode === "month" && (
              <div className="flex gap-1 flex-wrap">
                {[...data.periods].reverse().map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                    style={{ background: period === p ? "var(--accent)" : "var(--bg-subtle)", color: period === p ? "#fff" : "var(--text-secondary)" }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            {filterMode === "ytd" && (
              <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                <Calendar size={12} /> {data.rangePeriods?.length ?? 0} months
              </span>
            )}

            {filterMode === "range" && customFrom && customTo && data.rangePeriods?.length > 0 && (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {data.rangePeriods.length} month{data.rangePeriods.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Affiliate type filter */}
          <div className="flex gap-1 ml-auto flex-wrap items-center">
            {(["all", "live", "video"] as AffiliateType[]).map((t) => (
              <button
                key={t}
                onClick={() => setAffiliateType(t)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
                style={{ background: affiliateType === t ? "var(--accent)" : "var(--bg-subtle)", color: affiliateType === t ? "#fff" : "var(--text-secondary)" }}
              >
                {t === "all" ? "All" : t === "live" ? "🔴 Livestream" : "🎬 Videos"}
              </button>
            ))}

            {/* Product filter */}
            {allProducts.length > 0 && (
              <div className="relative" ref={productPickerRef}>
                <button
                  onClick={() => setProductPickerOpen((o) => !o)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
                  style={{
                    background: selectedProductIds.length > 0 ? "color-mix(in oklab, var(--accent) 15%, var(--bg-subtle))" : "var(--bg-subtle)",
                    color: selectedProductIds.length > 0 ? "var(--accent)" : "var(--text-secondary)",
                    border: selectedProductIds.length > 0 ? "1px solid color-mix(in oklab, var(--accent) 40%, transparent)" : "1px solid transparent",
                  }}
                >
                  <Package size={12} />
                  {selectedProductIds.length === 0 ? "All products" : `${selectedProductIds.length} product${selectedProductIds.length !== 1 ? "s" : ""}`}
                  <ChevronDown size={11} style={{ opacity: 0.6 }} />
                </button>

                {productPickerOpen && (
                  <div
                    className="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-lg border"
                    style={{ background: "var(--bg-card)", borderColor: "var(--border)", minWidth: "240px" }}
                  >
                    {/* Quick actions */}
                    <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                      <button
                        onClick={() => setSelectedProductIds(allProducts.map((p) => p.productId))}
                        className="text-xs font-semibold"
                        style={{ color: "var(--accent)" }}
                      >
                        Select all
                      </button>
                      <button
                        onClick={() => setSelectedProductIds([])}
                        className="text-xs font-semibold"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Clear
                      </button>
                    </div>

                    {/* Scrollable product list */}
                    <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                      {allProducts.map((p) => {
                        const checked = selectedProductIds.includes(p.productId);
                        return (
                          <label
                            key={p.productId}
                            className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors hover:bg-[var(--bg-subtle)]"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setSelectedProductIds((prev) =>
                                  checked ? prev.filter((id) => id !== p.productId) : [...prev, p.productId]
                                );
                              }}
                              className="flex-shrink-0"
                            />
                            <span className="flex-1 text-xs truncate" style={{ color: "var(--text-primary)" }} title={p.productName}>
                              {p.productName}
                            </span>
                            <span className="text-xs font-mono tabular-nums flex-shrink-0" style={{ color: "var(--text-muted)" }}>
                              {formatCurrency(p.gmv)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {!data && !dataError && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      )}

      {dataError && (
        <div className="section-card p-6 text-center">
          <p className="text-sm font-semibold mb-1" style={{ color: "#ef4444" }}>Failed to load affiliate data</p>
          <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{dataError}</p>
          <button
            onClick={() => { cache.current.clear(); setRetryKey(k => k + 1); }}
            className="mt-3 text-xs px-3 py-1.5 rounded-md font-semibold"
            style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
          >
            Retry
          </button>
        </div>
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
            <KpiCard
              label="GMV"
              value={formatCurrency(gmvKpiValue)}
              fullValue={formatCurrency(gmvKpiValue)}
              delta={selectedProductIds.length > 0 ? null : gmvDelta}
              badge={selectedProductIds.length > 0 ? `${selectedProductIds.length} product${selectedProductIds.length !== 1 ? "s" : ""}` : undefined}
            />
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
                      <th className="px-2 sm:px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Period</th>
                      <th className="px-2 sm:px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>GMV</th>
                      <th className="px-2 sm:px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>Videos</th>
                      <th className="px-2 sm:px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>Lives</th>
                      <th className="px-2 sm:px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Blacklist</th>
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
                          <td className="px-2 sm:px-3 py-2 text-center font-medium tabular-nums" style={{ color: isActive || inRange ? "var(--accent)" : "var(--text-primary)" }}>
                            {s.period}
                            {inRange && <span className="ml-1.5 text-[10px] opacity-60">✓</span>}
                          </td>
                          <td className="px-2 sm:px-3 py-2 text-center font-mono tabular-nums whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{formatCurrency(s.gmv)}</td>
                          <td className="px-2 sm:px-3 py-2 text-center tabular-nums hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>{s.videos.toLocaleString()}</td>
                          <td className="px-2 sm:px-3 py-2 text-center tabular-nums hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>{s.liveStreams.toLocaleString()}</td>
                          <td className="px-2 sm:px-3 py-2 text-center tabular-nums whitespace-nowrap" style={{ color: s.blacklisted > 0 ? "#ef4444" : "var(--text-muted)" }}>
                            <span className="inline-flex items-center gap-1 justify-center">
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
                <div>
                  <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    Top 10 creators by GMV
                    {data.rangeMode && <span className="ml-1 text-xs font-normal" style={{ color: "var(--text-muted)" }}>(aggregated)</span>}
                  </div>
                  {selectedProductIds.length > 0 && (
                    <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                      Creator GMV reflects all products
                    </div>
                  )}
                </div>
                <Link href={creatorsHref} className="text-xs flex items-center gap-1" style={{ color: "var(--accent)" }}>
                  View all <ArrowRight size={11} />
                </Link>
              </div>
              <div className="space-y-0">
                <div className="flex items-center py-1.5 -mx-1 px-1 gap-1">
                  <span className="w-7 flex-shrink-0 text-center text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>#</span>
                  <span className="w-14 flex-shrink-0" />
                  <span className="flex-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Creator</span>
                  <span className="w-24 text-center text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>GMV</span>
                </div>
                {filteredTopCreators.map((c, i) => (
                  <Link
                    key={c.id}
                    href={creatorHref(c.creatorName)}
                    className="flex items-center py-1.5 border-t hover:bg-[var(--bg-subtle)] -mx-1 px-1 rounded transition-colors gap-1"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span className="font-mono text-xs w-7 flex-shrink-0 text-center" style={{ color: "var(--text-muted)" }}>#{i + 1}</span>
                    <span className="w-14 flex-shrink-0"><LabelChip label={c.label} /></span>
                    <span className="flex-1 truncate font-medium text-sm" style={{ color: "var(--text-primary)" }}>{c.creatorName}</span>
                    <span className="w-24 text-center font-mono tabular-nums text-sm whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{formatCurrency(c.gmv)}</span>
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
                  {selectedProductIds.length > 0
                    ? `${selectedProductIds.length} selected product${selectedProductIds.length !== 1 ? "s" : ""}`
                    : "Top 10 products by GMV"}
                  {data.rangeMode && <span className="ml-1 text-xs font-normal" style={{ color: "var(--text-muted)" }}>(aggregated)</span>}
                </div>
                <Link href={productsHref} className="text-xs flex items-center gap-1" style={{ color: "var(--accent)" }}>
                  View all <ArrowRight size={11} />
                </Link>
              </div>
              <div className="space-y-0">
                <div className="flex items-center py-1.5 -mx-1 px-1 gap-1">
                  <span className="w-7 flex-shrink-0 text-center text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>#</span>
                  <span className="flex-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Product</span>
                  <span className="w-24 text-center text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>GMV</span>
                </div>
                {(() => {
                  // Normalize to ProductOption[] for rendering
                  const displayList: ProductOption[] = selectedProductIds.length > 0
                    ? filteredProducts
                    : allProducts.length > 0
                    ? allProducts.slice(0, 10)
                    : data.topProducts.map((p) => ({ productId: p.id, productName: p.productName, gmv: p.gmv }));
                  return displayList.map((p, i) => {
                    // Build href: prefer brandId|productId composite (handled by product detail page)
                    const productLinkId = brandId ? `${brandId}|${p.productId}` : p.productId;
                    const href = productHref(productLinkId);
                    return (
                      <Link
                        key={p.productId}
                        href={href}
                        className="flex items-center py-1.5 border-t hover:bg-[var(--bg-subtle)] -mx-1 px-1 rounded transition-colors gap-1"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <span className="font-mono text-xs w-7 flex-shrink-0 text-center" style={{ color: "var(--text-muted)" }}>#{i + 1}</span>
                        <span className="flex-1 truncate font-medium text-sm" style={{ color: "var(--text-primary)" }} title={p.productName}>{p.productName}</span>
                        <span className="w-24 text-center font-mono tabular-nums text-sm whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{formatCurrency(p.gmv)}</span>
                      </Link>
                    );
                  });
                })()}
                {(selectedProductIds.length > 0 ? filteredProducts : (allProducts.length > 0 ? allProducts.slice(0, 10) : data.topProducts)).length === 0 && (
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
                <div className="flex items-center py-1.5 -mx-1 px-1 gap-1">
                  <span className="w-7 flex-shrink-0 text-center text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>#</span>
                  <span className="w-14 flex-shrink-0" />
                  <span className="flex-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Creator</span>
                  <span className="w-24 text-center text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>GMV</span>
                  <span className="w-14 text-center text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Lives</span>
                </div>
                {data.topLiveCreators.map((c, i) => (
                  <Link
                    key={c.id}
                    href={creatorHref(c.creatorName)}
                    className="flex items-center py-1.5 border-t hover:bg-[var(--bg-subtle)] -mx-1 px-1 rounded transition-colors gap-1"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span className="font-mono text-xs w-7 flex-shrink-0 text-center" style={{ color: "var(--text-muted)" }}>#{i + 1}</span>
                    <span className="w-14 flex-shrink-0"><LabelChip label={c.label} /></span>
                    <span className="flex-1 truncate font-medium text-sm" style={{ color: "var(--text-primary)" }}>{c.creatorName}</span>
                    <span className="w-24 text-center font-mono tabular-nums text-xs whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{formatCurrency(c.gmv)}</span>
                    <span className="w-14 text-center font-mono tabular-nums text-sm whitespace-nowrap font-semibold" style={{ color: "var(--accent)" }}>{c.liveStreams}</span>
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
                <div className="flex items-center py-1.5 -mx-1 px-1 gap-1">
                  <span className="w-7 flex-shrink-0 text-center text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>#</span>
                  <span className="w-14 flex-shrink-0" />
                  <span className="flex-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Creator</span>
                  <span className="w-24 text-center text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>GMV</span>
                  <span className="w-14 text-center text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Videos</span>
                </div>
                {data.topVideoCreators.map((c, i) => (
                  <Link
                    key={c.id}
                    href={creatorHref(c.creatorName)}
                    className="flex items-center py-1.5 border-t hover:bg-[var(--bg-subtle)] -mx-1 px-1 rounded transition-colors gap-1"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span className="font-mono text-xs w-7 flex-shrink-0 text-center" style={{ color: "var(--text-muted)" }}>#{i + 1}</span>
                    <span className="w-14 flex-shrink-0"><LabelChip label={c.label} /></span>
                    <span className="flex-1 truncate font-medium text-sm" style={{ color: "var(--text-primary)" }}>{c.creatorName}</span>
                    <span className="w-24 text-center font-mono tabular-nums text-xs whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{formatCurrency(c.gmv)}</span>
                    <span className="w-14 text-center font-mono tabular-nums text-sm whitespace-nowrap font-semibold" style={{ color: "var(--accent)" }}>{c.videos}</span>
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

interface KpiProps { label: string; value: string; fullValue: string; delta: number | null; badge?: string; }
function KpiCard({ label, value, fullValue, delta, badge }: KpiProps) {
  const showDelta = delta != null && Number.isFinite(delta);
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="section-card p-3 sm:p-4 min-w-0">
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-base sm:text-lg lg:text-xl font-bold mt-1 whitespace-nowrap tabular-nums" style={{ color: "var(--text-primary)" }} title={fullValue}>{value}</div>
      {badge && (
        <div className="mt-1 text-[11px] font-semibold px-1.5 py-0.5 rounded inline-block" style={{ background: "color-mix(in oklab, var(--accent) 12%, transparent)", color: "var(--accent)" }}>
          {badge}
        </div>
      )}
      {showDelta && !badge && (
        <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: positive ? "#10b981" : "#ef4444" }}>
          {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {Math.abs(delta!).toFixed(1)}% MoM
        </div>
      )}
    </div>
  );
}
