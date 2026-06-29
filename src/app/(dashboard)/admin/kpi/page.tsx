"use client";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Wand2, Save, Info, ExternalLink } from "lucide-react";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

interface BrandInfo {
  id: string;
  name: string;
  platform: string;
  color: string;
}

interface KPIConfigSaved {
  id: string;
  plannedHours: number;
  kpiRate: number;
  bauTier1: number;
  bauTier2: number;
  campTier1: number;
  campTier2: number;
}

interface PrevMonth {
  bauGMV: number;
  bauHours: number;
  campGMV: number;
  campHours: number;
}

interface Recommended {
  bauTier1: number;
  bauTier2: number;
  campTier1: number;
  campTier2: number;
}

interface BrandRow {
  brand: BrandInfo;
  gmvTarget: number;
  kpiConfig: KPIConfigSaved | null;
  prevMonth: PrevMonth;
  recommended: Recommended;
  estCommission: { kpi1: number; kpi2: number } | null;
}

interface EditState {
  plannedHours: number;
  kpiRate: number;
  bauTier1: number;
  bauTier2: number;
  campTier1: number;
  campTier2: number;
  /** true if T1/T2 values came from recommendation (not saved config) */
  isRecommended: boolean;
}

function initEdit(row: BrandRow): EditState {
  if (row.kpiConfig) {
    return {
      plannedHours: row.kpiConfig.plannedHours,
      kpiRate: row.kpiConfig.kpiRate,
      bauTier1: row.kpiConfig.bauTier1,
      bauTier2: row.kpiConfig.bauTier2,
      campTier1: row.kpiConfig.campTier1,
      campTier2: row.kpiConfig.campTier2,
      isRecommended: false,
    };
  }
  return {
    plannedHours: 0,
    kpiRate: 1.0,
    bauTier1: row.recommended.bauTier1,
    bauTier2: row.recommended.bauTier2,
    campTier1: row.recommended.campTier1,
    campTier2: row.recommended.campTier2,
    isRecommended: true,
  };
}

function NumInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  return (
    <Input
      type="number"
      step="0.01"
      value={value === 0 ? "" : value}
      placeholder="0"
      className={className}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      style={{ width: "90px" }}
    />
  );
}

export default function BrandKPIPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<BrandRow[]>([]);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/brand-kpi?month=${month}&year=${year}`);
      const data = await res.json() as { brands: BrandRow[] };
      setRows(data.brands);
      const initialEdits: Record<string, EditState> = {};
      for (const row of data.brands) {
        initialEdits[row.brand.id] = initEdit(row);
      }
      setEdits(initialEdits);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  function updateEdit(brandId: string, patch: Partial<EditState>) {
    setEdits((prev) => ({
      ...prev,
      [brandId]: { ...prev[brandId], ...patch, isRecommended: false },
    }));
  }

  function recommendAll() {
    setEdits((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        next[row.brand.id] = {
          ...next[row.brand.id],
          bauTier1: row.recommended.bauTier1,
          bauTier2: row.recommended.bauTier2,
          campTier1: row.recommended.campTier1,
          campTier2: row.recommended.campTier2,
          isRecommended: true,
        };
      }
      return next;
    });
  }

  async function saveAll() {
    setSaving(true);
    try {
      const brandsPayload = rows.map((row) => {
        const edit = edits[row.brand.id] ?? initEdit(row);
        return {
          brandId: row.brand.id,
          plannedHours: edit.plannedHours,
          kpiRate: edit.kpiRate,
          bauTier1: edit.bauTier1,
          bauTier2: edit.bauTier2,
          campTier1: edit.campTier1,
          campTier2: edit.campTier2,
        };
      });
      const res = await fetch("/api/brand-kpi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, year, brands: brandsPayload }),
      });
      if (res.ok) {
        showToast("KPI settings saved!");
        await load();
      } else {
        showToast("Save failed. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  const stdBrands = rows.filter((r) => (edits[r.brand.id]?.kpiRate ?? 1.0) >= 1.0);
  const redBrands = rows.filter((r) => (edits[r.brand.id]?.kpiRate ?? 1.0) < 1.0);

  function renderTable(section: BrandRow[], title: string, rateLabel: string) {
    if (section.length === 0) return null;
    return (
      <div className="section-card" style={{ marginBottom: "1.5rem" }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</span>
          <Badge variant="secondary">{rateLabel}</Badge>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>({section.length} brand{section.length !== 1 ? "s" : ""})</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ minWidth: "1100px" }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ verticalAlign: "bottom" }}>Brand</th>
                <th rowSpan={2} style={{ verticalAlign: "bottom" }}>Platform</th>
                <th rowSpan={2} style={{ verticalAlign: "bottom", textAlign: "right" }}>Planned hrs</th>
                <th rowSpan={2} style={{ verticalAlign: "bottom", textAlign: "right" }}>KPI rate %</th>
                <th style={{ textAlign: "center" }}>Type</th>
                <th style={{ textAlign: "right" }}>Prev GMV</th>
                <th style={{ textAlign: "right" }}>Prev hrs</th>
                <th style={{ textAlign: "right" }}>Avg/hr</th>
                <th style={{ textAlign: "right", color: "var(--color-warning, #f59e0b)" }}>Rec T1</th>
                <th style={{ textAlign: "right", color: "var(--color-warning, #f59e0b)" }}>Rec T2</th>
                <th style={{ textAlign: "right" }}>T1 Target</th>
                <th style={{ textAlign: "right" }}>T2 Target</th>
              </tr>
            </thead>
            <tbody>
              {section.map((row) => {
                const edit = edits[row.brand.id];
                if (!edit) return null;
                const bauAvg = row.prevMonth.bauHours > 0 ? row.prevMonth.bauGMV / row.prevMonth.bauHours : 0;
                const campAvg = row.prevMonth.campHours > 0 ? row.prevMonth.campGMV / row.prevMonth.campHours : 0;
                return (
                  <>
                    {/* BAU row */}
                    <tr key={`${row.brand.id}-bau`}>
                      <td rowSpan={2} style={{ verticalAlign: "middle", fontWeight: 500 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: row.brand.color, flexShrink: 0, display: "inline-block" }} />
                          {row.brand.name}
                        </span>
                      </td>
                      <td rowSpan={2} style={{ verticalAlign: "middle", color: "var(--text-secondary)" }}>
                        {row.brand.platform}
                      </td>
                      <td rowSpan={2} style={{ verticalAlign: "middle", textAlign: "right" }}>
                        <NumInput
                          value={edit.plannedHours}
                          onChange={(v) => updateEdit(row.brand.id, { plannedHours: v })}
                          className="text-right"
                        />
                      </td>
                      <td rowSpan={2} style={{ verticalAlign: "middle", textAlign: "right" }}>
                        <Select
                          value={edit.kpiRate}
                          onChange={(e) => updateEdit(row.brand.id, { kpiRate: Number(e.target.value) })}
                          style={{ width: "70px" }}
                        >
                          <option value={1.0}>1.0%</option>
                          <option value={0.5}>0.5%</option>
                        </Select>
                      </td>
                      <td><Badge variant="secondary">BAU</Badge></td>
                      <td style={{ textAlign: "right", color: "var(--text-secondary)", fontSize: "0.85em" }}>
                        {row.prevMonth.bauGMV > 0 ? formatCurrency(row.prevMonth.bauGMV) : "—"}
                      </td>
                      <td style={{ textAlign: "right", color: "var(--text-secondary)", fontSize: "0.85em" }}>
                        {row.prevMonth.bauHours > 0 ? row.prevMonth.bauHours.toFixed(1) + "h" : "—"}
                      </td>
                      <td style={{ textAlign: "right", color: "var(--text-secondary)", fontSize: "0.85em" }}>
                        {bauAvg > 0 ? formatCurrency(bauAvg) + "/h" : "—"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span style={{ color: "var(--color-warning, #f59e0b)", fontSize: "0.82em", whiteSpace: "nowrap" }}>
                          {row.recommended.bauTier1 > 0 ? formatCurrency(row.recommended.bauTier1) : "—"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span style={{ color: "var(--color-warning, #f59e0b)", fontSize: "0.82em", whiteSpace: "nowrap" }}>
                          {row.recommended.bauTier2 > 0 ? formatCurrency(row.recommended.bauTier2) : "—"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: "flex-end" }}>
                          {edit.isRecommended && <span style={{ fontSize: "0.65em", padding: "1px 4px", background: "var(--color-warning, #f59e0b)", color: "#fff", borderRadius: "4px", fontWeight: 600 }}>Rec</span>}
                          <NumInput
                            value={edit.bauTier1}
                            onChange={(v) => updateEdit(row.brand.id, { bauTier1: v })}
                            className="text-right"
                          />
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <NumInput
                          value={edit.bauTier2}
                          onChange={(v) => updateEdit(row.brand.id, { bauTier2: v })}
                          className="text-right"
                        />
                      </td>
                    </tr>
                    {/* Campaign row */}
                    <tr key={`${row.brand.id}-camp`}>
                      <td><Badge variant="warning">Campaign</Badge></td>
                      <td style={{ textAlign: "right", color: "var(--text-secondary)", fontSize: "0.85em" }}>
                        {row.prevMonth.campGMV > 0 ? formatCurrency(row.prevMonth.campGMV) : "—"}
                      </td>
                      <td style={{ textAlign: "right", color: "var(--text-secondary)", fontSize: "0.85em" }}>
                        {row.prevMonth.campHours > 0 ? row.prevMonth.campHours.toFixed(1) + "h" : "—"}
                      </td>
                      <td style={{ textAlign: "right", color: "var(--text-secondary)", fontSize: "0.85em" }}>
                        {campAvg > 0 ? formatCurrency(campAvg) + "/h" : "—"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span style={{ color: "var(--color-warning, #f59e0b)", fontSize: "0.82em", whiteSpace: "nowrap" }}>
                          {row.recommended.campTier1 > 0 ? formatCurrency(row.recommended.campTier1) : "—"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span style={{ color: "var(--color-warning, #f59e0b)", fontSize: "0.82em", whiteSpace: "nowrap" }}>
                          {row.recommended.campTier2 > 0 ? formatCurrency(row.recommended.campTier2) : "—"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: "flex-end" }}>
                          {edit.isRecommended && <span style={{ fontSize: "0.65em", padding: "1px 4px", background: "var(--color-warning, #f59e0b)", color: "#fff", borderRadius: "4px", fontWeight: 600 }}>Rec</span>}
                          <NumInput
                            value={edit.campTier1}
                            onChange={(v) => updateEdit(row.brand.id, { campTier1: v })}
                            className="text-right"
                          />
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <NumInput
                          value={edit.campTier2}
                          onChange={(v) => updateEdit(row.brand.id, { campTier2: v })}
                          className="text-right"
                        />
                      </td>
                    </tr>
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Commission estimate table
  const commRows = rows.filter((r) => r.gmvTarget > 0);
  const totalKpi1 = commRows.reduce((s, r) => {
    const kpiRate = edits[r.brand.id]?.kpiRate ?? 1.0;
    return s + r.gmvTarget * (kpiRate / 100);
  }, 0);
  const totalKpi2 = totalKpi1;

  return (
    <div className="space-y-5 animate-in">
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 9999,
            background: "var(--color-success, #22c55e)",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: "8px",
            fontWeight: 500,
            fontSize: "0.9rem",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          }}
        >
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>KPI Settings</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Set GMV/hour targets and commission rates per brand for the selected month
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-28">
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </Select>
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24">
            {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Button variant="secondary" onClick={recommendAll}>
            <Wand2 size={14} /> Recommend all
          </Button>
          <Button onClick={saveAll} loading={saving}>
            <Save size={14} /> Save all
          </Button>
        </div>
      </div>

      {/* Info banner */}
      <div className="alert alert-info">
        <Info size={15} className="flex-shrink-0 mt-0.5" />
        <div>
          <strong>How it works:</strong> Recommended T1 = last month avg/hr × 1.3, T2 = × 1.8.
          KPI rate % is the commission paid on total GMV when the tier is achieved.
          Values shown in <span style={{ color: "var(--color-warning, #f59e0b)", fontWeight: 600 }}>amber</span> are auto-recommended and not yet saved.
        </div>
      </div>

      {loading ? (
        <div className="section-card" style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
          Loading…
        </div>
      ) : (
        <>
          {renderTable(stdBrands, "Standard Tier", "1.0% KPI rate")}
          {renderTable(redBrands, "Reduced Tier", "0.5% KPI rate")}

          {/* Commission estimate */}
          {commRows.length > 0 && (
            <div className="section-card">
              <div className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                Estimated Commission (if KPI achieved)
              </div>
              <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                Based on GMV targets for {MONTHS[month - 1]} {year}. Commission = GMV Target × KPI rate.
              </p>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Brand</th>
                    <th className="text-right">GMV Target</th>
                    <th className="text-right">KPI Rate</th>
                    <th className="text-right">Est. Commission (KPI1)</th>
                    <th className="text-right">Est. Commission (KPI2)</th>
                  </tr>
                </thead>
                <tbody>
                  {commRows.map((row) => {
                    const kpiRate = edits[row.brand.id]?.kpiRate ?? 1.0;
                    const est = row.gmvTarget * (kpiRate / 100);
                    return (
                      <tr key={row.brand.id}>
                        <td className="font-medium">
                          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: row.brand.color, flexShrink: 0, display: "inline-block" }} />
                            {row.brand.name}
                          </span>
                        </td>
                        <td className="text-right" style={{ color: "var(--text-secondary)" }}>{formatCurrency(row.gmvTarget)}</td>
                        <td className="text-right"><Badge variant="secondary">{kpiRate}%</Badge></td>
                        <td className="text-right">{formatCurrency(est)}</td>
                        <td className="text-right">{formatCurrency(est)}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ fontWeight: 600, borderTop: "2px solid var(--border)" }}>
                    <td>Total</td>
                    <td className="text-right">{formatCurrency(commRows.reduce((s, r) => s + r.gmvTarget, 0))}</td>
                    <td />
                    <td className="text-right">{formatCurrency(totalKpi1)}</td>
                    <td className="text-right">{formatCurrency(totalKpi2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Link to old host-level page */}
          <div style={{ textAlign: "right" }}>
            <a
              href="/admin/kpi/host"
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", color: "var(--text-muted)" }}
            >
              Advanced: per-host KPI overrides <ExternalLink size={12} />
            </a>
          </div>
        </>
      )}
    </div>
  );
}
