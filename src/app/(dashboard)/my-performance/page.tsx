"use client";
import { useState, useEffect } from "react";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, Clock, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import type { HostMonthlyStats } from "@/lib/commission";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function mytMonthYear() {
  const myt = new Date(Date.now() + 8 * 3_600_000);
  return { month: myt.getUTCMonth() + 1, year: myt.getUTCFullYear() };
}

export default function MyPerformancePage() {
  const { month: mM, year: mY } = mytMonthYear();
  const [month, setMonth] = useState(mM);
  const [year, setYear] = useState(mY);
  const [stats, setStats] = useState<HostMonthlyStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [brandsOpen, setBrandsOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/performance?month=${month}&year=${year}`)
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); });
  }, [month, year]);

  return (
    <div className="space-y-4 animate-in max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>My Performance</h1>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>{MONTHS[month - 1]} {year}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Select value={month} onChange={e => setMonth(Number(e.target.value))} className="w-24 text-sm">
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </Select>
          <Select value={year} onChange={e => setYear(Number(e.target.value))} className="w-20 text-sm">
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </Select>
        </div>
      </div>

      {loading && (
        <div className="section-card py-12 text-center" style={{ color: "var(--text-muted)" }}>
          <div className="inline-block w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
        </div>
      )}

      {!loading && !stats && (
        <div className="section-card py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>No data for this period.</div>
      )}

      {!loading && stats && (
        <div className="space-y-3">

          {/* 4 stat chips */}
          <div className="grid grid-cols-2 gap-3">
            <Chip
              icon={TrendingUp}
              label="Total GMV"
              value={formatCurrency(stats.totalGMV)}
              color="var(--accent)"
            />
            <Chip
              icon={Clock}
              label="Hours Done"
              value={`${stats.totalActualHours.toFixed(1)}h`}
              sub={`Required: ${stats.requiredHours.toFixed(1)}h`}
              color={stats.hoursDeficit > 5 ? "var(--danger)" : "var(--success)"}
            />
            <Chip
              icon={AlertTriangle}
              label="Late Sessions"
              value={String(stats.lateSessions)}
              sub={stats.lateSessions > 5 ? "Threshold exceeded" : `${5 - stats.lateSessions} remaining`}
              color={stats.lateSessions > 5 ? "var(--danger)" : "var(--warning)"}
            />
            <Chip
              icon={CheckCircle2}
              label="Completed"
              value={`${stats.totalCompletedSessions}/${stats.totalScheduledSessions}`}
              sub="sessions"
              color="var(--accent)"
            />
          </div>

          {/* Commission card */}
          <div className="section-card p-4">
            <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Estimated Commission</p>
            <p className="text-3xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
              {formatCurrency(stats.netCommission)}
            </p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--bg-subtle)" }}>
                <p style={{ color: "var(--text-muted)" }} className="mb-0.5">Base</p>
                <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{formatCurrency(stats.estimatedCommission)}</p>
              </div>
              <div
                className="rounded-lg p-2.5 text-center"
                style={{ background: stats.hoursDeduction > 0 ? "rgba(239,68,68,0.1)" : "var(--bg-subtle)" }}
              >
                <p style={{ color: "var(--text-muted)" }} className="mb-0.5">Hours Deduction</p>
                <p className="font-semibold" style={{ color: stats.hoursDeduction > 0 ? "var(--danger)" : "var(--text-secondary)" }}>
                  {stats.hoursDeduction > 0 ? `−${formatCurrency(stats.hoursDeduction)}` : "—"}
                </p>
              </div>
              <div
                className="rounded-lg p-2.5 text-center"
                style={{ background: stats.punctualityDeduction > 0 ? "rgba(239,68,68,0.1)" : "var(--bg-subtle)" }}
              >
                <p style={{ color: "var(--text-muted)" }} className="mb-0.5">Punctuality</p>
                <p className="font-semibold" style={{ color: stats.punctualityDeduction > 0 ? "var(--danger)" : "var(--text-secondary)" }}>
                  {stats.punctualityDeduction > 0 ? `−${formatCurrency(stats.punctualityDeduction)}` : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Hours + Punctuality side-by-side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Hours */}
            <div className="section-card p-4">
              <p className="text-xs font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>Hours Tracking</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span style={{ color: "var(--text-muted)" }}>Required</span>
                  <span style={{ color: "var(--text-primary)" }}>{stats.requiredHours.toFixed(1)}h</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: "var(--text-muted)" }}>Completed</span>
                  <span style={{ color: stats.hoursDeficit > 5 ? "var(--danger)" : "var(--success)", fontWeight: 600 }}>
                    {stats.totalActualHours.toFixed(1)}h
                  </span>
                </div>
                <div className="progress-track mt-2">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.min(100, (stats.totalActualHours / (stats.requiredHours || 1)) * 100)}%`,
                      background: stats.hoursDeficit > 5 ? "var(--danger)" : "var(--success)",
                    }}
                  />
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {((stats.totalActualHours / (stats.requiredHours || 1)) * 100).toFixed(0)}% completed
                  {stats.hoursDeficit > 0 && ` · ${stats.hoursDeficit.toFixed(1)}h deficit`}
                </p>
                {stats.hoursDeficit > 5 && (
                  <p className="text-xs" style={{ color: "var(--danger)" }}>
                    ⚠ Deficit &gt;5h → −0.5% deduction
                  </p>
                )}
              </div>
            </div>

            {/* Punctuality */}
            <div className="section-card p-4">
              <p className="text-xs font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>Punctuality</p>
              <div className="space-y-2">
                {[
                  { label: "Early", count: stats.earlySessions, color: "var(--accent)" },
                  { label: "On Time", count: stats.onTimeSessions, color: "var(--success)" },
                  { label: "Late", count: stats.lateSessions, color: "var(--warning)" },
                  { label: "Missed", count: stats.missedSessions, color: "var(--danger)" },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-2">
                    <span className="text-xs w-14 flex-shrink-0" style={{ color: "var(--text-muted)" }}>{row.label}</span>
                    <div className="flex-1 progress-track">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${(row.count / (stats.totalScheduledSessions || 1)) * 100}%`,
                          background: row.color,
                        }}
                      />
                    </div>
                    <span className="text-xs font-semibold w-5 text-right" style={{ color: row.color }}>{row.count}</span>
                  </div>
                ))}
              </div>
              {stats.lateSessions > 5 && (
                <p className="text-xs mt-2" style={{ color: "var(--danger)" }}>
                  ⚠ {stats.lateSessions} late sessions → −0.5% deduction
                </p>
              )}
            </div>
          </div>

          {/* KPI by brand — collapsible */}
          {stats.byBrand.length > 0 && (
            <div className="section-card p-4">
              <button
                onClick={() => setBrandsOpen(o => !o)}
                className="w-full flex items-center justify-between text-left"
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
              >
                <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Commission by Brand
                </p>
                {brandsOpen ? <ChevronUp size={14} style={{ color: "var(--text-muted)" }} /> : <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />}
              </button>

              {brandsOpen && (
                <div className="mt-3 space-y-2">
                  {stats.byBrand.map(b => {
                    const tierLabel = b.bauTier === 2 ? "Tier 2" : b.bauTier === 1 ? "Tier 1" : "—";
                    const tierColor = b.bauTier === 2 ? "var(--success)" : b.bauTier === 1 ? "var(--warning)" : "var(--text-muted)";
                    return (
                      <div
                        key={b.brandId}
                        className="rounded-lg p-3 text-sm"
                        style={{ background: "var(--bg-subtle)" }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-xs" style={{ color: "var(--text-primary)" }}>{b.brandName}</span>
                          <span className="text-xs font-semibold" style={{ color: tierColor }}>{tierLabel}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <p style={{ color: "var(--text-muted)" }} className="mb-0.5">GMV</p>
                            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{formatCurrency(b.totalGMV)}</p>
                          </div>
                          <div>
                            <p style={{ color: "var(--text-muted)" }} className="mb-0.5">Rate</p>
                            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
                              {b.kpiConfigFound
                                ? (b.bauTier === 2 ? `${b.kpi1Rate + b.kpi2Rate}%` : `${b.kpi1Rate}%`)
                                : "—"}
                            </p>
                          </div>
                          <div>
                            <p style={{ color: "var(--text-muted)" }} className="mb-0.5">Commission</p>
                            <p className="font-semibold" style={{ color: b.estimatedCommission > 0 ? "var(--success)" : "var(--text-secondary)" }}>
                              {formatCurrency(b.estimatedCommission)}
                            </p>
                          </div>
                        </div>
                        {!b.kpiConfigFound && (
                          <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>No KPI config for this month</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

function Chip({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="section-card p-3.5">
      <div className="inline-flex p-1.5 rounded-lg mb-2" style={{ background: color + "18", color }}>
        <Icon size={14} />
      </div>
      <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="text-xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{sub}</p>}
    </div>
  );
}
