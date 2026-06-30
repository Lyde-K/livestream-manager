"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import {
  Upload, Package, TrendingUp, ShoppingCart, MousePointerClick,
  ArrowUpDown, Trash2, AlertCircle, CheckCircle2, ChevronDown, BarChart3,
} from "lucide-react";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const FULL_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

interface Brand { id: string; name: string; color: string; }
interface ProductRow {
  id: string;
  brandId: string;
  brand: { id: string; name: string; color: string };
  platform: string;
  month: number; year: number;
  productId: string | null;
  productName: string;
  gmv: number;
  unitsSold: number;
  orders: number;
  clicks: number;
  convRate: number | null;
}

function fmtNum(n: number) { return n.toLocaleString(); }
function fmtPct(n: number | null) { return n != null ? n.toFixed(1) + "%" : "—"; }

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string; sub?: string; icon: React.ElementType; accent?: boolean;
}) {
  return (
    <div className="section-card px-4 py-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: accent ? "var(--accent)" : "var(--bg-subtle)" }}>
        <Icon size={15} style={{ color: accent ? "#fff" : "var(--text-muted)" }} />
      </div>
      <div>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</div>
        <div className="text-lg font-bold" style={{ color: accent ? "var(--accent)" : "var(--text-primary)" }}>{value}</div>
        {sub && <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Import Panel ─────────────────────────────────────────────────────────────

function ImportPanel({ brands, month, year, platform, onImported }: {
  brands: Brand[]; month: number; year: number;
  platform: "TIKTOK" | "SHOPEE";
  onImported: () => void;
}) {
  const [brandId, setBrandId] = useState("");
  const [file, setFile]       = useState<File | null>(null);
  const [replace, setReplace] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<string>("");
  const [error, setError]     = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function parseAndUpload() {
    if (!file || !brandId) { setError("Select a brand and file first."); return; }
    setLoading(true); setResult(""); setError("");
    try {
      const buf = await file.arrayBuffer();
      const ExcelJS = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const ws = wb.worksheets[0];

      // Auto-detect headers
      const colMap: Record<string, number> = {};
      let headerRowNum = -1;
      ws.eachRow((row, rn) => {
        if (headerRowNum !== -1) return;
        const vals = row.values as (string | null | undefined)[];
        const hasHeader = vals.some(v =>
          typeof v === "string" && /product|item|sku|gmv|sale|unit|sold|order|click/i.test(v)
        );
        if (hasHeader) {
          headerRowNum = rn;
          vals.forEach((v, i) => { if (v) colMap[String(v).trim().toLowerCase()] = i; });
        }
      });

      if (headerRowNum === -1) { setError("Could not find header row. Make sure the file has column headers."); setLoading(false); return; }

      // Column finders
      function findCol(...keys: string[]): number {
        for (const k of keys) {
          for (const [h, i] of Object.entries(colMap)) {
            if (h.includes(k)) return i;
          }
        }
        return -1;
      }

      const nameIdx  = findCol("product name","item name","product","name","sku name");
      const idIdx    = findCol("product id","item id","sku id","id");
      const gmvIdx   = findCol("gmv","sales","revenue","sale amount");
      const unitsIdx = findCol("units sold","item sold","qty sold","quantity sold","unit","items sold");
      const ordIdx   = findCol("order","orders","confirmed order");
      const clkIdx   = findCol("click","clicks","product click");
      const cvrIdx   = findCol("cvr","conv","conversion");

      if (nameIdx === -1) { setError("Could not find product name column."); setLoading(false); return; }
      if (gmvIdx  === -1) { setError("Could not find GMV/sales column."); setLoading(false); return; }

      const rows: {
        productId?: string; productName: string; gmv: number;
        unitsSold: number; orders: number; clicks: number; convRate?: number;
      }[] = [];

      ws.eachRow((row, rn) => {
        if (rn <= headerRowNum) return;
        const vals = row.values as (string | number | null | undefined)[];
        const name = String(vals[nameIdx] ?? "").trim();
        if (!name) return;

        function numVal(idx: number): number {
          if (idx === -1) return 0;
          const v = vals[idx];
          if (v == null) return 0;
          return parseFloat(String(v).replace(/[^0-9.-]/g, "")) || 0;
        }

        rows.push({
          productId:   idIdx  !== -1 ? String(vals[idIdx] ?? "").trim() || undefined : undefined,
          productName: name,
          gmv:         numVal(gmvIdx),
          unitsSold:   Math.round(numVal(unitsIdx)),
          orders:      Math.round(numVal(ordIdx)),
          clicks:      Math.round(numVal(clkIdx)),
          convRate:    cvrIdx !== -1 ? numVal(cvrIdx) || undefined : undefined,
        });
      });

      if (rows.length === 0) { setError("No data rows found."); setLoading(false); return; }

      const res = await fetch("/api/product-performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, platform, month, year, replace, rows }),
      });

      if (!res.ok) { setError("Upload failed. Please try again."); setLoading(false); return; }
      const json = await res.json();
      setResult(`✓ Imported ${json.count} products`);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onImported();
    } catch (e) {
      setError("Failed to parse file: " + String(e));
    }
    setLoading(false);
  }

  return (
    <div className="section-card p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Upload size={14} style={{ color: "var(--accent)" }} />
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Import Product Data — {FULL_MONTHS[month-1]} {year}
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
          style={{ background: platform === "TIKTOK" ? "#00000015" : "#ee4d2d20", color: platform === "TIKTOK" ? "var(--text-secondary)" : "#ee4d2d" }}>
          {platform}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Brand</label>
          <select
            value={brandId} onChange={e => setBrandId(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm border"
            style={{ background: "var(--bg-subtle)", borderColor: "var(--border)", color: "var(--text)" }}>
            <option value="">Select brand…</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Excel / CSV file</label>
          <input
            ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-xs rounded-lg px-3 py-2 border cursor-pointer"
            style={{ background: "var(--bg-subtle)", borderColor: "var(--border)", color: "var(--text)" }}
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--text-muted)" }}>
          <input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} className="rounded" />
          Replace existing data for this month
        </label>
        <div className="flex-1" />
        {result && <span className="text-xs font-medium" style={{ color: "var(--success)" }}>{result}</span>}
        {error  && <span className="text-xs" style={{ color: "var(--danger)" }}>{error}</span>}
        <button
          onClick={parseAndUpload}
          disabled={loading || !file || !brandId}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
          style={{ background: "var(--accent)" }}>
          <Upload size={13} />
          {loading ? "Importing…" : "Import"}
        </button>
      </div>

      <div className="rounded-lg px-3 py-2 text-[11px] space-y-0.5" style={{ background: "var(--bg-subtle)", color: "var(--text-muted)" }}>
        <div className="font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>Expected columns (auto-detected):</div>
        <div>• <strong>Product Name</strong> (required) — product name / item name / SKU name</div>
        <div>• <strong>GMV / Sales</strong> (required) — GMV, sales, revenue, sale amount</div>
        <div>• <strong>Units Sold</strong> — units sold, item sold, qty sold</div>
        <div>• <strong>Orders</strong> — orders, confirmed orders</div>
        <div>• <strong>Clicks</strong> — clicks, product clicks</div>
        <div>• <strong>Conversion Rate</strong> — CVR, conversion %</div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProductPerformancePage() {
  const now = new Date();
  const [month, setMonth]       = useState(now.getMonth() + 1);
  const [year, setYear]         = useState(now.getFullYear());
  const [platform, setPlatform] = useState<"TIKTOK" | "SHOPEE">("TIKTOK");
  const [brandFilter, setBrandFilter] = useState("");
  const [sortBy, setSortBy]     = useState<"gmv" | "units">("gmv");
  const [rows, setRows]         = useState<ProductRow[]>([]);
  const [brands, setBrands]     = useState<Brand[]>([]);
  const [loading, setLoading]   = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ month: String(month), year: String(year), platform, sortBy });
    if (brandFilter) params.set("brandId", brandFilter);
    fetch(`/api/product-performance?${params}`)
      .then(r => r.json())
      .then(d => { setRows(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [month, year, platform, sortBy, brandFilter]);

  useEffect(() => {
    fetch("/api/brands").then(r => r.json()).then(d => setBrands(Array.isArray(d) ? d : (d.brands ?? [])));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function deleteMonthData(brandId: string) {
    if (!confirm(`Delete all ${platform} product data for ${MONTHS[month-1]} ${year} for this brand?`)) return;
    setDeleting(brandId);
    await fetch(`/api/product-performance?brandId=${brandId}&platform=${platform}&month=${month}&year=${year}`, { method: "DELETE" });
    setDeleting(null);
    load();
  }

  // Aggregates
  const totalGMV    = rows.reduce((s, r) => s + r.gmv, 0);
  const totalUnits  = rows.reduce((s, r) => s + r.unitsSold, 0);
  const totalOrders = rows.reduce((s, r) => s + r.orders, 0);
  const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
  const avgConv     = rows.filter(r => r.convRate != null).reduce((s, r) => s + (r.convRate ?? 0), 0) / (rows.filter(r => r.convRate != null).length || 1);

  // Group by brand for brand summaries
  const brandGroups: Record<string, { brand: Brand; rows: ProductRow[] }> = {};
  for (const r of rows) {
    if (!brandGroups[r.brandId]) brandGroups[r.brandId] = { brand: r.brand, rows: [] };
    brandGroups[r.brandId].rows.push(r);
  }

  const rank = (r: ProductRow, i: number) => i + 1;

  return (
    <div className="space-y-5 animate-in">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Product Performance</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {FULL_MONTHS[month-1]} {year} · {platform}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={month} onChange={e => setMonth(Number(e.target.value))} className="w-24">
            {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </Select>
          <Select value={year} onChange={e => setYear(Number(e.target.value))} className="w-20">
            {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
          </Select>
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            {(["TIKTOK","SHOPEE"] as const).map(p => (
              <button key={p} onClick={() => setPlatform(p)}
                className="px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{ background: platform === p ? "var(--accent)" : "var(--bg-card)", color: platform === p ? "#fff" : "var(--text-muted)" }}>
                {p}
              </button>
            ))}
          </div>
          <select
            value={brandFilter} onChange={e => setBrandFilter(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-xs border"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
            <option value="">All Brands</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button
            onClick={() => setShowImport(s => !s)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: showImport ? "var(--accent)" : "var(--bg-card)", color: showImport ? "#fff" : "var(--text-muted)", border: "1px solid var(--border)" }}>
            <Upload size={12} /> Import
          </button>
        </div>
      </div>

      {/* Import panel */}
      {showImport && (
        <ImportPanel brands={brands} month={month} year={year} platform={platform} onImported={load} />
      )}

      {/* Summary cards */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total GMV" value={formatCurrency(totalGMV)} icon={TrendingUp} accent />
          <StatCard label="Units Sold" value={fmtNum(totalUnits)} icon={Package} />
          <StatCard label="Orders" value={fmtNum(totalOrders)} icon={ShoppingCart} />
          <StatCard label="Total Clicks" value={fmtNum(totalClicks)} sub={`Avg CVR ${fmtPct(avgConv)}`} icon={MousePointerClick} />
        </div>
      )}

      {/* Sort toggle */}
      {rows.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Sort by</span>
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <button onClick={() => setSortBy("gmv")}
              className="px-3 py-1 text-xs font-semibold transition-colors"
              style={{ background: sortBy === "gmv" ? "var(--accent)" : "var(--bg-card)", color: sortBy === "gmv" ? "#fff" : "var(--text-muted)" }}>
              GMV
            </button>
            <button onClick={() => setSortBy("units")}
              className="px-3 py-1 text-xs font-semibold transition-colors"
              style={{ background: sortBy === "units" ? "var(--accent)" : "var(--bg-card)", color: sortBy === "units" ? "#fff" : "var(--text-muted)" }}>
              Units Sold
            </button>
          </div>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{rows.length} products</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="section-card py-12 text-center" style={{ color: "var(--text-muted)" }}>
          <div className="inline-block w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!loading && rows.length === 0 && (
        <div className="section-card py-12 text-center space-y-3">
          <Package size={32} style={{ color: "var(--text-muted)", margin: "0 auto" }} />
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>
            No product data for {FULL_MONTHS[month-1]} {year} · {platform}
          </div>
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: "var(--accent)" }}>
            <Upload size={13} /> Import Data
          </button>
        </div>
      )}

      {/* Per-brand sections */}
      {!loading && Object.values(brandGroups).map(({ brand, rows: bRows }) => {
        const bGMV    = bRows.reduce((s, r) => s + r.gmv, 0);
        const bUnits  = bRows.reduce((s, r) => s + r.unitsSold, 0);
        const bOrders = bRows.reduce((s, r) => s + r.orders, 0);
        const bClicks = bRows.reduce((s, r) => s + r.clicks, 0);
        const maxGMV  = bRows[0]?.gmv ?? 1;

        return (
          <div key={brand.id} className="section-card overflow-hidden">
            {/* Brand header */}
            <div className="px-5 py-3 flex items-center justify-between"
              style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-subtle)" }}>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: brand.color }} />
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{brand.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "var(--bg-card)", color: "var(--text-muted)" }}>
                  {bRows.length} products
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span style={{ color: "var(--text-muted)" }}>GMV <strong style={{ color: "var(--text-primary)" }}>{formatCurrency(bGMV)}</strong></span>
                <span style={{ color: "var(--text-muted)" }}>Units <strong style={{ color: "var(--text-primary)" }}>{fmtNum(bUnits)}</strong></span>
                <span style={{ color: "var(--text-muted)" }}>Orders <strong style={{ color: "var(--text-primary)" }}>{fmtNum(bOrders)}</strong></span>
                <button onClick={() => deleteMonthData(brand.id)} disabled={deleting === brand.id}
                  className="p-1 rounded hover:bg-red-500/10 transition-colors disabled:opacity-40">
                  <Trash2 size={13} style={{ color: "var(--danger)" }} />
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wide w-8" style={{ color: "var(--text-muted)" }}>#</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Product</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>GMV</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Units Sold</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Orders</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Clicks</th>
                    <th className="text-right px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>CVR</th>
                  </tr>
                </thead>
                <tbody>
                  {bRows.map((r, i) => {
                    const barPct = maxGMV > 0 ? (r.gmv / maxGMV) * 100 : 0;
                    const isTop3 = i < 3;
                    return (
                      <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "")}>
                        {/* Rank */}
                        <td className="px-5 py-3">
                          <span className="text-xs font-bold tabular-nums"
                            style={{ color: isTop3 ? "var(--accent)" : "var(--text-muted)" }}>
                            {rank(r, i)}
                          </span>
                        </td>
                        {/* Product name + bar */}
                        <td className="px-3 py-3 max-w-xs">
                          <div className="font-medium text-sm truncate" style={{ color: "var(--text-primary)" }}>{r.productName}</div>
                          {r.productId && (
                            <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>ID: {r.productId}</div>
                          )}
                          {/* GMV bar */}
                          <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: "var(--bg-subtle)", width: "160px" }}>
                            <div className="h-full rounded-full" style={{
                              width: `${barPct}%`,
                              background: isTop3 ? "var(--accent)" : "var(--border)",
                            }} />
                          </div>
                        </td>
                        {/* GMV */}
                        <td className="px-3 py-3 text-right tabular-nums">
                          <span className="font-semibold" style={{ color: isTop3 ? "var(--accent)" : "var(--text-primary)" }}>
                            {formatCurrency(r.gmv)}
                          </span>
                          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                            {totalGMV > 0 ? ((r.gmv / totalGMV) * 100).toFixed(1) + "%" : "—"}
                          </div>
                        </td>
                        {/* Units */}
                        <td className="px-3 py-3 text-right tabular-nums">
                          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{fmtNum(r.unitsSold)}</span>
                          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                            {bUnits > 0 ? ((r.unitsSold / bUnits) * 100).toFixed(1) + "%" : "—"}
                          </div>
                        </td>
                        {/* Orders */}
                        <td className="px-3 py-3 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>
                          {fmtNum(r.orders)}
                        </td>
                        {/* Clicks */}
                        <td className="px-3 py-3 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>
                          {fmtNum(r.clicks)}
                        </td>
                        {/* CVR */}
                        <td className="px-5 py-3 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>
                          {fmtPct(r.convRate)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Brand total row */}
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--border)", background: "var(--bg-subtle)" }}>
                    <td className="px-5 py-2.5" />
                    <td className="px-3 py-2.5 text-xs font-bold" style={{ color: "var(--text-secondary)" }}>Total</td>
                    <td className="px-3 py-2.5 text-right text-sm font-bold tabular-nums" style={{ color: "var(--accent)" }}>{formatCurrency(bGMV)}</td>
                    <td className="px-3 py-2.5 text-right text-sm font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{fmtNum(bUnits)}</td>
                    <td className="px-3 py-2.5 text-right text-sm font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{fmtNum(bOrders)}</td>
                    <td className="px-3 py-2.5 text-right text-sm font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{fmtNum(bClicks)}</td>
                    <td className="px-5 py-2.5 text-right text-xs" style={{ color: "var(--text-muted)" }}>
                      {bClicks > 0 ? ((bOrders / bClicks) * 100).toFixed(1) + "%" : "—"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
