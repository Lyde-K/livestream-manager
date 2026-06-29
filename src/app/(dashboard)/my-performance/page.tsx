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
    setStats(null);
    fetch(`/api/performance?month=${month}&year=${year}`)
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [month, year]);

  const monthLabel = `${MONTHS[month - 1]} ${year}`;

  return (
    <div className="space-y-4 animate-in max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>My Performance</h1>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>{monthLabel}</p>
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
        <div className="section-card py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          No sessions found for {monthLabel}.
        </div>
      )}

      {!loading && stats && (
        <div className="space-y-3">

          {/* 4 stat chips */}
          <div className="grid grid-cols-2 gap-3">
            <Chip icon={TrendingUp} label="Total GMV" value={formatCurrency(stats.totalGMV)} color="var(--accent)" />
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
              sub={stats.lateSessions > 5 ? "Threshold exceeded" : `${Math.max(0, 5 - stats.lateSessions)} remaining`}
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

          {/* My Earnings card */}
          <div className="section-card p-4">
            <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>My Estimated Earnings — {monthLabel}</p>
            <p className="text-3xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
              {formatCurrency(stats.netCommission)}
            </p>

            {/* Breakdown row */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--bg-subtle)" }}>
                <p style={{ color: "var(--text-muted)" }} className="mb-0.5">Base Commission</p>
                <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
                  {formatCurrency(stats.estimatedCommission)}
                </p>
              </div>
              <div
                className="rounded-lg p-2.5 text-center"
                style={{ background: stats.attendanceCommission > 0 ? "rgba(34,197,94,0.1)" : "var(--bg-subtle)" }}
              >
                <p style={{ color: "var(--text-muted)" }} className="mb-0.5">Attendance Bonus</p>
                <p className="font-semibold" style={{ color: stats.attendanceCommission > 0 ? "var(--success)" : "var(--text-muted)" }}>
                  {stats.attendanceCommission > 0 ? `+${formatCurrency(stats.attendanceCommission)}` : "—"}
                </p>
              </div>
              <div
                className="rounded-lg p-2.5 text-center"
                style={{ background: stats.punctualityCommission > 0 ? "rgba(34,197,94,0.1)" : "var(--bg-subtle)" }}
              >
                <p style={{ color: "var(--text-muted)" }} className="mb-0.5">Punctuality Bonus</p>
                <p className="font-semibold" style={{ color: stats.punctualityCommission > 0 ? "var(--success)" : "var(--text-muted)" }}>
                  {stats.punctualityCommission > 0 ? `+${formatCurrency(stats.punctualityCommission)}` : "—"}
                </p>
              </div>
            </div>

            {/* Bonus explanations */}
            <div className="mt-3 space-y-1">
              {stats.attendanceCommission === 0 && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Complete {stats.requiredHours.toFixed(1)}h to unlock +0.5% attendance bonus
                </p>
              )}
              {stats.punctualityCommission === 0 && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Keep late sessions ≤ 5 to unlock +0.5% punctuality bonus
                </p>
              )}
            </div>
          </div>

          {/* Hours + Punctuality */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <div className="progress-track mt-1">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.min(100, (stats.totalActualHours / (stats.requiredHours || 1)) * 100)}%`,
                      background: stats.hoursDeficit > 5 ? "var(--danger)" : "var(--success)",
                    }}
                  />
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {((stats.totalActualHours / (stats.requiredHours || 1)) * 100).toFixed(0)}% of required hours
                  {stats.hoursDeficit > 0 && (
                    <span style={{ color: stats.hoursDeficit > 5 ? "var(--danger)" : "var(--text-muted)" }}>
                      {" "}· {stats.hoursDeficit.toFixed(1)}h short
                    </span>
                  )}
                </p>
              </div>
            </div>

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
                  ⚠ {stats.lateSessions} late — exceeds 5-session limit
                </p>
              )}
            </div>
          </div>

          {/* Earnings by brand — collapsible */}
          {stats.byBrand.length > 0 && (
            <div className="section-card p-4">
              <button
                onClick={() => setBrandsOpen(o => !o)}
                className="w-full flex items-center justify-between text-left"
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
              >
                <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Earnings by Brand
                </p>
                {brandsOpen
                  ? <ChevronUp size={14} style={{ color: "var(--text-muted)" }} />
                  : <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />}
              </button>

              {brandsOpen && (
                <div className="mt-3 space-y-2">
                  {stats.byBrand.map(b => {
                    // Determine the effective rate used for this brand's commission
                    const effectiveRate = b.estimatedCommission > 0 && b.totalGMV > 0
                      ? (b.estimatedCommission / b.totalGMV) * 100
                      : null;

                    return (
                      <div
                        key={b.brandId}
                        className="rounded-lg p-3"
                        style={{ background: "var(--bg-subtle)" }}
                      >
                        {/* Brand header */}
                        <div className="flex items-center justify-between mb-2.5">
                          <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                            {b.brandName}
                            <span className="ml-1.5 font-normal" style={{ color: "var(--text-muted)" }}>· {b.platform}</span>
                          </span>
                          <span className="text-xs font-bold" style={{ color: b.estimatedCommission > 0 ? "var(--success)" : "var(--text-muted)" }}>
                            {formatCurrency(b.estimatedCommission)}
                          </span>
                        </div>

                        {/* GMV + sessions row */}
                        <div className="flex gap-3 text-xs mb-2" style={{ color: "var(--text-muted)" }}>
                          <span>GMV <strong style={{ color: "var(--text-secondary)" }}>{formatCurrency(b.totalGMV)}</strong></span>
                          <span>{b.completedSessions} sessions · {b.totalHours.toFixed(1)}h</span>
                        </div>

                        {/* GMV/hour grid */}
                        <div className="grid grid-cols-2 gap-1.5 mb-2">
                          <div className="rounded p-2 text-xs" style={{ background: "var(--bg-card)" }}>
                            <p style={{ color: "var(--text-muted)" }} className="mb-0.5">BAU GMV/hr</p>
                            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
                              {b.normalDayGMVPerHour > 0 ? formatCurrency(b.normalDayGMVPerHour) : "—"}
                            </p>
                          </div>
                          <div className="rounded p-2 text-xs" style={{ background: "var(--bg-card)" }}>
                            <p style={{ color: "var(--text-muted)" }} className="mb-0.5">Campaign GMV/hr</p>
                            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
                              {b.campaignDayGMVPerHour > 0 ? formatCurrency(b.campaignDayGMVPerHour) : "—"}
                            </p>
                          </div>
                        </div>

                        {/* KPI rates row */}
                        {b.kpiConfigFound ? (
                          <div className="flex gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
                            <span>KPI 1 <strong style={{ color: "var(--accent)" }}>{b.kpi1Rate}%</strong></span>
                            <span>KPI 2 <strong style={{ color: "var(--accent)" }}>{b.kpi2Rate}%</strong></span>
                            {effectiveRate !== null && (
                              <span>Effective <strong style={{ color: "var(--text-secondary)" }}>{effectiveRate.toFixed(2)}%</strong></span>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Commission rate not set for this month</p>
                        )}
                      </div>
                    );
                  })}

                  {/* Total row */}
                  <div
                    className="rounded-lg p-3 flex items-center justify-between"
                    style={{ background: "var(--bg-subtle)", borderTop: "1px solid var(--border)" }}
                  >
                    <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Total</span>
                    <span className="text-xs font-bold" style={{ color: "var(--success)" }}>
                      {formatCurrency(stats.estimatedCommission)}
                    </span>
                  </div>
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
