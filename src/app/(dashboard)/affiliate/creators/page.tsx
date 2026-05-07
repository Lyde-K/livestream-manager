"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LabelChip } from "@/components/affiliate/label-chip";
import { formatCurrency } from "@/lib/utils";
import { ArrowDown, ArrowUp, Minus, Search, Users } from "lucide-react";

interface Brand {
  id: string;
  name: string;
  color: string;
  client: { user: { name: string } } | null;
}

interface CreatorRow {
  id: string;
  creatorName: string;
  period: string;
  rank: number | null;
  rankDelta: number | null;
  gmv: number;
  videos: number;
  liveStreams: number;
  estCommission: number;
  samplesShipped: number;
  roi: number | null;
  label: string | null;
  brand: { id: string; name: string; color: string };
}

const LABELS = ["STAR", "A", "B", "F"] as const;

export default function AffiliateCreatorsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [brandId, setBrandId] = useState("");
  const [period, setPeriod] = useState("");
  const [search, setSearch] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [sortBy, setSortBy] = useState<"rank" | "gmv" | "roi" | "videos" | "samplesShipped">("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [rows, setRows] = useState<CreatorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/affiliate/brands")
      .then((r) => r.json())
      .then((data: { brands: Brand[] }) => {
        setBrands(data.brands);
        if (data.brands.length === 1) setBrandId(data.brands[0].id);
      });
  }, []);

  useEffect(() => {
    const url = brandId ? `/api/affiliate/periods?brandId=${brandId}` : "/api/affiliate/periods";
    fetch(url)
      .then((r) => r.json())
      .then((data: { periods: string[] }) => {
        setPeriods(data.periods);
        if (data.periods.length > 0 && !data.periods.includes(period)) setPeriod(data.periods[0]);
      });
  }, [brandId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!period) {
      setRows([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ period, sortBy, sortDir, limit: "200" });
    if (brandId) params.set("brandId", brandId);
    if (search.trim()) params.set("search", search.trim());
    if (labelFilter) params.set("label", labelFilter);

    fetch(`/api/affiliate/creators?${params}`)
      .then((r) => r.json())
      .then((data: { rows: CreatorRow[]; total: number }) => {
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [brandId, period, search, labelFilter, sortBy, sortDir]);

  const summary = useMemo(() => {
    const totalGmv = rows.reduce((s, r) => s + r.gmv, 0);
    const totalCommission = rows.reduce((s, r) => s + r.estCommission, 0);
    const totalVideos = rows.reduce((s, r) => s + r.videos, 0);
    const totalLives = rows.reduce((s, r) => s + r.liveStreams, 0);
    return { totalGmv, totalCommission, totalVideos, totalLives };
  }, [rows]);

  function toggleSort(field: typeof sortBy) {
    if (sortBy === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDir(field === "rank" ? "asc" : "desc");
    }
  }

  function SortableTh({ field, children, align = "left", tooltip }: { field: typeof sortBy; children: React.ReactNode; align?: "left" | "right"; tooltip?: string }) {
    const active = sortBy === field;
    return (
      <th
        scope="col"
        title={tooltip}
        className={`px-2 sm:px-3 py-2 text-xs font-semibold uppercase tracking-wide cursor-pointer select-none ${align === "right" ? "text-right" : "text-left"}`}
        style={{ color: active ? "var(--accent)" : "var(--text-secondary)" }}
        onClick={() => toggleSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          {active && (sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
        </span>
      </th>
    );
  }

  return (
    <div className="space-y-5 animate-in">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Users size={20} /> Affiliate Creators
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {total > 0 ? `${total.toLocaleString()} creators` : "No data"} · sorted by {sortBy} {sortDir}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="section-card p-3 flex flex-wrap items-end gap-3">
        {brands.length > 1 && (
          <div className="min-w-[180px]">
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Brand</label>
            <Select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">All my brands</option>
              {brands.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
            </Select>
          </div>
        )}
        <div className="min-w-[140px]">
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Period</label>
          <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {periods.length === 0 && <option value="">No data</option>}
            {periods.map((p) => (<option key={p} value={p}>{p}</option>))}
          </Select>
        </div>
        <div className="min-w-[140px]">
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Label</label>
          <Select value={labelFilter} onChange={(e) => setLabelFilter(e.target.value)}>
            <option value="">All</option>
            {LABELS.map((l) => (<option key={l} value={l}>{l === "STAR" ? "⭐ Star" : l}</option>))}
          </Select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Search creator</label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ainauhibbi…" className="pl-8" />
          </div>
        </div>
      </div>

      {/* Summary */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="Total GMV" value={formatCurrency(summary.totalGmv)} title={formatCurrency(summary.totalGmv)} />
          <SummaryCard label="Est. Commission" value={formatCurrency(summary.totalCommission)} title={formatCurrency(summary.totalCommission)} />
          <SummaryCard label="Videos" value={summary.totalVideos.toLocaleString()} />
          <SummaryCard label="Lives" value={summary.totalLives.toLocaleString()} />
        </div>
      )}

      {/* Table */}
      <div className="section-card">
        <div className="overflow-x-auto -mx-px">
          <table className="w-full text-sm">
            <thead style={{ background: "var(--bg-subtle)" }}>
              <tr>
                <SortableTh field="rank" tooltip="GMV rank for the selected period — #1 is the top earner. Ties share the same rank.">Rank</SortableTh>
                <th className="px-2 sm:px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Creator</th>
                {brands.length > 1 && (
                  <th className="px-2 sm:px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide hidden md:table-cell" style={{ color: "var(--text-secondary)" }}>Brand</th>
                )}
                <SortableTh field="gmv" align="right" tooltip="Gross Merchandise Value — total sales (RM) generated through this creator's content this period.">GMV</SortableTh>
                <SortableTh field="roi" align="right" tooltip="Return on Investment = GMV ÷ Est. Commission. Green ≥ 2x, red < 1x. Higher = more revenue per RM paid out.">ROI</SortableTh>
                <th title="Shoppable video posts uploaded this period." className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide hidden sm:table-cell cursor-help" style={{ color: "var(--text-secondary)" }}>
                  <span className="cursor-pointer select-none" onClick={() => toggleSort("videos")}>Videos</span>
                </th>
                <th title="Live streams hosted this period." className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide hidden sm:table-cell cursor-help" style={{ color: "var(--text-secondary)" }}>Lives</th>
                <th title="Sample units shipped to this creator — used as the cost basis when computing ROI." className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide hidden sm:table-cell cursor-help" style={{ color: "var(--text-secondary)" }}>
                  <span className="cursor-pointer select-none" onClick={() => toggleSort("samplesShipped")}>Samples</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>No creators for this filter.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-2 sm:px-3 py-2 font-mono text-xs whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                    <div className="flex items-center gap-1.5">
                      <span>#{r.rank ?? "—"}</span>
                      {r.rankDelta != null && r.rankDelta !== 0 && (
                        <span className="inline-flex items-center text-[10px] gap-0.5" style={{ color: r.rankDelta > 0 ? "#10b981" : "#ef4444" }}>
                          {r.rankDelta > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                          {Math.abs(r.rankDelta)}
                        </span>
                      )}
                      {r.rankDelta === 0 && <Minus size={10} style={{ color: "var(--text-muted)" }} />}
                    </div>
                  </td>
                  <td className="px-2 sm:px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <LabelChip label={r.label} />
                      <Link
                        href={`/affiliate/creators/${encodeURIComponent(r.creatorName)}`}
                        className="font-medium hover:underline truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {r.creatorName}
                      </Link>
                    </div>
                  </td>
                  {brands.length > 1 && (
                    <td className="px-2 sm:px-3 py-2 text-xs hidden md:table-cell" style={{ color: "var(--text-secondary)" }}>{r.brand.name}</td>
                  )}
                  <td className="px-2 sm:px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{formatCurrency(r.gmv)}</td>
                  <td className="px-2 sm:px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap" style={{ color: r.roi != null && r.roi >= 2 ? "#10b981" : r.roi != null && r.roi < 1 ? "#ef4444" : "var(--text-secondary)" }}>
                    {r.roi != null ? `${r.roi.toFixed(1)}x` : "—"}
                  </td>
                  <td className="px-2 sm:px-3 py-2 text-right tabular-nums whitespace-nowrap hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>{r.videos}</td>
                  <td className="px-2 sm:px-3 py-2 text-right tabular-nums whitespace-nowrap hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>{r.liveStreams}</td>
                  <td className="px-2 sm:px-3 py-2 text-right tabular-nums whitespace-nowrap hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>{r.samplesShipped}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="section-card p-3 min-w-0">
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-base sm:text-lg font-bold mt-0.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-primary)" }} title={title}>{value}</div>
    </div>
  );
}
