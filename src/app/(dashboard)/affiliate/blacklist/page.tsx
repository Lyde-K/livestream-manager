"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { Ban, Download } from "lucide-react";

interface Brand { id: string; name: string; color: string; client: { user: { name: string } } | null; }

interface BlacklistRow {
  id: string;
  creatorName: string;
  period: string;
  gmv: number;
  estCommission: number;
  roi: number | null;
  videos: number;
  liveStreams: number;
  samplesShipped: number;
  brand: { name: string };
}

function reasonFor(r: BlacklistRow): string {
  const reasons: string[] = [];
  if (r.samplesShipped > 0 && r.videos === 0 && r.liveStreams === 0) reasons.push("No content");
  if (r.samplesShipped > 0 && r.gmv === 0) reasons.push("No GMV");
  if (r.roi != null && r.roi > 0 && r.roi < 1) reasons.push("ROI <1x");
  return reasons.join(" · ") || "Underperforming";
}

export default function AffiliateBlacklistPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [brandId, setBrandId] = useState("");
  const [period, setPeriod] = useState("");
  const [rows, setRows] = useState<BlacklistRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/affiliate/brands")
      .then((r) => r.json())
      .then((d: { brands: Brand[] }) => {
        setBrands(d.brands);
        if (d.brands.length === 1) setBrandId(d.brands[0].id);
      });
  }, []);

  useEffect(() => {
    const url = brandId ? `/api/affiliate/periods?brandId=${brandId}` : "/api/affiliate/periods";
    fetch(url)
      .then((r) => r.json())
      .then((d: { periods: string[] }) => {
        setPeriods(d.periods);
        if (d.periods.length > 0 && !d.periods.includes(period)) setPeriod(d.periods[0]);
      });
  }, [brandId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!period) { setRows([]); return; }
    setLoading(true);
    const params = new URLSearchParams({ period });
    if (brandId) params.set("brandId", brandId);
    fetch(`/api/affiliate/blacklist?${params}`)
      .then((r) => r.json())
      .then((d: { rows: BlacklistRow[] }) => setRows(d.rows ?? []))
      .finally(() => setLoading(false));
  }, [brandId, period]);

  function downloadCsv() {
    if (!period) return;
    const params = new URLSearchParams({ period, format: "csv" });
    if (brandId) params.set("brandId", brandId);
    window.location.href = `/api/affiliate/blacklist?${params}`;
  }

  return (
    <div className="space-y-5 animate-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Ban size={20} style={{ color: "#ef4444" }} /> Blacklist
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {rows.length > 0 ? `${rows.length} F-rank creators` : "No data"} · samples shipped without sufficient output
          </p>
        </div>
        <Button onClick={downloadCsv} disabled={rows.length === 0}>
          <Download size={14} /> Export CSV
        </Button>
      </div>

      <div className="section-card p-3 flex flex-wrap items-end gap-3">
        {brands.length > 1 && (
          <div className="min-w-[160px]">
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
      </div>

      <div className="section-card">
        <div className="overflow-x-auto -mx-px">
          <table className="w-full text-sm">
            <thead style={{ background: "var(--bg-subtle)" }}>
              <tr>
                <th className="px-2 sm:px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Creator</th>
                {brands.length > 1 && (
                  <th className="px-2 sm:px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide hidden md:table-cell" style={{ color: "var(--text-secondary)" }}>Brand</th>
                )}
                <th className="px-2 sm:px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Samples</th>
                <th className="px-2 sm:px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>Videos</th>
                <th className="px-2 sm:px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>Lives</th>
                <th className="px-2 sm:px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>GMV</th>
                <th className="px-2 sm:px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide hidden md:table-cell" style={{ color: "var(--text-secondary)" }}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>No blacklisted creators 🎉</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-2 sm:px-3 py-2 font-medium" style={{ color: "var(--text-primary)" }}>{r.creatorName}</td>
                  {brands.length > 1 && (
                    <td className="px-2 sm:px-3 py-2 text-xs hidden md:table-cell" style={{ color: "var(--text-secondary)" }}>{r.brand.name}</td>
                  )}
                  <td className="px-2 sm:px-3 py-2 text-center tabular-nums whitespace-nowrap font-semibold" style={{ color: "#ef4444" }}>{r.samplesShipped}</td>
                  <td className="px-2 sm:px-3 py-2 text-center tabular-nums whitespace-nowrap hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>{r.videos}</td>
                  <td className="px-2 sm:px-3 py-2 text-center tabular-nums whitespace-nowrap hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>{r.liveStreams}</td>
                  <td className="px-2 sm:px-3 py-2 text-center font-mono tabular-nums whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{formatCurrency(r.gmv)}</td>
                  <td className="px-2 sm:px-3 py-2 text-xs hidden md:table-cell" style={{ color: "var(--text-secondary)" }}>{reasonFor(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
