"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { ArrowDown, ArrowUp, Download, Loader2, Package, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Brand {
  id: string;
  name: string;
  color: string;
  client: { user: { name: string } } | null;
}

interface ProductRow {
  id: string;
  productId: string;
  productName: string;
  category: string | null;
  gmv: number;
  prevGmv: number | null;
  itemsSold: number;
  videos: number;
  liveStreams: number;
  estCommission: number;
  samplesShipped: number;
  roi: number | null;
  tier: string | null;
  brand: { id: string; name: string; color: string };
}

const TIER_STYLES: Record<string, { bg: string; fg: string; text: string }> = {
  EXCEPTIONAL: { bg: "color-mix(in oklab, #10b981 18%, transparent)", fg: "#059669", text: "Exceptional" },
  AVERAGE: { bg: "var(--bg-subtle)", fg: "var(--text-secondary)", text: "Average" },
  UNDERPERFORMING: { bg: "color-mix(in oklab, #ef4444 16%, transparent)", fg: "#ef4444", text: "Under" },
};

function TierChip({ tier }: { tier: string | null }) {
  if (!tier) return null;
  const style = TIER_STYLES[tier] ?? TIER_STYLES.AVERAGE;
  return (
    <span
      className="inline-flex items-center rounded-md font-semibold text-[10px] px-1.5 py-0.5 leading-tight whitespace-nowrap"
      style={{ background: style.bg, color: style.fg }}
    >
      {style.text}
    </span>
  );
}

export default function AffiliateProductsPage() {
  const router = useRouter();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [brandId, setBrandId] = useState(() => {
    if (typeof window !== "undefined") return new URLSearchParams(window.location.search).get("brandId") ?? "";
    return "";
  });
  const [period, setPeriod] = useState(() => {
    if (typeof window !== "undefined") return new URLSearchParams(window.location.search).get("period") ?? "";
    return "";
  });
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("");
  const [category, setCategory] = useState("");
  const [sortBy, setSortBy] = useState<"gmv" | "roi" | "itemsSold" | "videos">("gmv");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);

  const syncUrl = useCallback((newBrandId: string, newPeriod: string) => {
    const sp = new URLSearchParams();
    if (newBrandId) sp.set("brandId", newBrandId);
    if (newPeriod) sp.set("period", newPeriod);
    const qs = sp.toString();
    router.replace(`/affiliate/products${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router]);

  async function handleExport() {
    if (!period || exporting) return;
    setExporting(true);
    try {
      const params = new URLSearchParams({ period, sortBy, sortDir });
      if (brandId) params.set("brandId", brandId);
      if (search.trim()) params.set("search", search.trim());
      if (tier) params.set("tier", tier);
      if (category) params.set("category", category);

      const res = await fetch(`/api/affiliate/products/export?${params}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `affiliate-products-${period.replace(/\s/g, "-")}${tier ? `-${tier}` : ""}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    fetch("/api/affiliate/brands")
      .then((r) => r.json())
      .then((data: { brands: Brand[] }) => {
        setBrands(data.brands);
        if (data.brands.length === 1 && !brandId) setBrandId(data.brands[0].id);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ytdYear = periods.length > 0 ? periods[0].substring(0, 4) : String(new Date().getFullYear());

  useEffect(() => {
    const url = brandId ? `/api/affiliate/periods?brandId=${brandId}` : "/api/affiliate/periods";
    fetch(url)
      .then((r) => r.json())
      .then((data: { periods: string[] }) => {
        setPeriods(data.periods);
        if (data.periods.length > 0 && !data.periods.includes(period) && period !== "YTD") {
          setPeriod(data.periods[data.periods.length - 1]);
        }
      });
  }, [brandId]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevPeriod = useMemo(() => {
    const idx = periods.indexOf(period);
    return idx > 0 ? periods[idx - 1] : null;
  }, [periods, period]);

  useEffect(() => {
    if (!period) { setRows([]); return; }
    setLoading(true);
    const params = new URLSearchParams({ period, sortBy, sortDir });
    if (brandId) params.set("brandId", brandId);
    if (prevPeriod) params.set("prevPeriod", prevPeriod);
    if (search.trim()) params.set("search", search.trim());
    if (tier) params.set("tier", tier);
    if (category) params.set("category", category);

    fetch(`/api/affiliate/products?${params}`)
      .then((r) => r.json())
      .then((data: { rows: ProductRow[]; categories: string[] }) => {
        setRows(data.rows ?? []);
        setCategories(data.categories ?? []);
      })
      .finally(() => setLoading(false));
  }, [brandId, period, prevPeriod, search, tier, category, sortBy, sortDir]);

  const summary = useMemo(() => {
    const totalGmv = rows.reduce((s, r) => s + r.gmv, 0);
    const totalCommission = rows.reduce((s, r) => s + r.estCommission, 0);
    const totalItems = rows.reduce((s, r) => s + r.itemsSold, 0);
    const totalLives = rows.reduce((s, r) => s + r.liveStreams, 0);
    return { totalGmv, totalCommission, totalItems, totalLives };
  }, [rows]);

  function toggleSort(field: typeof sortBy) {
    if (sortBy === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("desc"); }
  }

  function SortableTh({ field, children, align = "left", tooltip }: { field: typeof sortBy; children: React.ReactNode; align?: "left" | "center" | "right"; tooltip?: string }) {
    const active = sortBy === field;
    return (
      <th
        title={tooltip}
        className={`px-2 sm:px-3 py-2 text-xs font-semibold uppercase tracking-wide cursor-pointer select-none ${align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left"}`}
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
            <Package size={20} /> Affiliate Products
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {rows.length > 0 ? `${rows.length} products` : "No data"} · sorted by {sortBy} {sortDir}
          </p>
        </div>
        {rows.length > 0 && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer"
            style={{
              background: "var(--bg-subtle)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
              opacity: exporting ? 0.6 : 1,
            }}
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {exporting ? "Exporting…" : "Export Excel"}
          </button>
        )}
      </div>

      <div className="section-card p-3 flex flex-wrap items-end gap-3">
        {brands.length > 1 && (
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Brand</label>
            <Select value={brandId} onChange={(e) => { setBrandId(e.target.value); syncUrl(e.target.value, period); }}>
              <option value="">All my brands</option>
              {brands.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
            </Select>
          </div>
        )}
        <div className="min-w-[120px]">
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Period</label>
          <Select value={period} onChange={(e) => { setPeriod(e.target.value); syncUrl(brandId, e.target.value); }}>
            {periods.length === 0 && <option value="">No data</option>}
            {periods.length > 0 && (
              <option value="YTD">📅 {ytdYear} — Year to Date</option>
            )}
            {periods.map((p) => (<option key={p} value={p}>{p}</option>))}
          </Select>
        </div>
        <div className="min-w-[120px]">
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Tier</label>
          <Select value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="">All</option>
            <option value="EXCEPTIONAL">Exceptional</option>
            <option value="AVERAGE">Average</option>
            <option value="UNDERPERFORMING">Under</option>
          </Select>
        </div>
        {categories.length > 1 && (
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Category</label>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All</option>
              {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
            </Select>
          </div>
        )}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Search product</label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="AirySoft…" className="pl-8" />
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="Total GMV" value={formatCurrency(summary.totalGmv)} title={formatCurrency(summary.totalGmv)} />
          <SummaryCard label="Est. Commission" value={formatCurrency(summary.totalCommission)} title={formatCurrency(summary.totalCommission)} />
          <SummaryCard label="Items Sold" value={summary.totalItems.toLocaleString()} />
          <SummaryCard label="Lives" value={summary.totalLives.toLocaleString()} />
        </div>
      )}

      <div className="section-card">
        <div className="overflow-x-auto -mx-px">
          <table className="w-full text-sm">
            <thead style={{ background: "var(--bg-subtle)" }}>
              <tr>
                <th className="px-2 sm:px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide w-8" style={{ color: "var(--text-secondary)" }}>#</th>
                <th className="px-2 sm:px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Product</th>
                <SortableTh field="gmv" align="center" tooltip="Gross Merchandise Value — total sales (RM) generated by this product this period.">GMV</SortableTh>
                <th title="Month-over-Month change in GMV vs the previous period. Green = growth, red = decline." className="px-2 sm:px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide cursor-help hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>MoM</th>
                <SortableTh field="roi" align="center" tooltip="GMV ÷ Est. Commission — revenue generated per RM paid in commission for this product.">ROI</SortableTh>
                <SortableTh field="itemsSold" align="center" tooltip="Total units sold this period.">Items</SortableTh>
                <th title="Creator videos featuring this product this period." className="px-2 sm:px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide hidden sm:table-cell cursor-help" style={{ color: "var(--text-secondary)" }}>Videos</th>
                <th title="Live streams featuring this product this period." className="px-2 sm:px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide hidden sm:table-cell cursor-help" style={{ color: "var(--text-secondary)" }}>Lives</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>No products for this filter.</td></tr>
              )}
              {rows.map((r, i) => {
                const mom = r.prevGmv && r.prevGmv > 0 ? ((r.gmv - r.prevGmv) / r.prevGmv) * 100 : null;
                const momUp = mom != null && mom >= 0;
                return (
                  <tr key={r.id} className="border-t cursor-pointer hover:bg-[var(--bg-subtle)] transition-colors" style={{ borderColor: "var(--border)" }}>
                    <td className="px-2 sm:px-3 py-2 font-mono text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>#{i + 1}</td>
                    <td className="px-2 sm:px-3 py-2 max-w-[220px] sm:max-w-[380px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <TierChip tier={r.tier} />
                        <Link href={`/affiliate/products/${encodeURIComponent(r.id)}`} className="font-medium truncate hover:underline" style={{ color: "var(--text-primary)" }} title={r.productName}>{r.productName}</Link>
                      </div>
                      {r.category && (
                        <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{r.category}</div>
                      )}
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-center font-mono tabular-nums whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{formatCurrency(r.gmv)}</td>
                    <td className="px-2 sm:px-3 py-2 text-center whitespace-nowrap hidden sm:table-cell">
                      {mom != null ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: momUp ? "#10b981" : "#ef4444" }}>
                          {momUp ? <ArrowUp size={9} /> : <ArrowDown size={9} />}
                          {Math.abs(mom).toFixed(0)}%
                        </span>
                      ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-center font-mono tabular-nums whitespace-nowrap" style={{ color: r.roi != null && r.roi >= 2 ? "#10b981" : r.roi != null && r.roi < 1 ? "#ef4444" : "var(--text-secondary)" }}>
                      {r.roi != null ? `${r.roi.toFixed(1)}x` : "—"}
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-center tabular-nums whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{r.itemsSold.toLocaleString()}</td>
                    <td className="px-2 sm:px-3 py-2 text-center tabular-nums whitespace-nowrap hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>{r.videos}</td>
                    <td className="px-2 sm:px-3 py-2 text-center tabular-nums whitespace-nowrap hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>{r.liveStreams}</td>
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

function SummaryCard({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="section-card p-3 min-w-0">
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-base sm:text-lg font-bold mt-0.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-primary)" }} title={title}>{value}</div>
    </div>
  );
}
