"use client";
import { useState, useEffect } from "react";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
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

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/performance?month=${month}&year=${year}`);
    setStats(await res.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, [month, year]);

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>My Performance</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>KPI, hours, punctuality, and commission estimate</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-28">
            {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </Select>
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24">
            {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
          </Select>
        </div>
      </div>

      {loading && (
        <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
          <div className="inline-block w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin mb-2" />
          <div>Loading…</div>
        </div>
      )}

      {!loading && !stats && (
        <div className="section-card empty-state">No data for this period.</div>
      )}

      {stats && (
        <div className="space-y-5">
          {/* Top cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatChip icon={TrendingUp} label="Total GMV" value={formatCurrency(stats.totalGMV)} colorVar="var(--accent)" />
            <StatChip
              icon={Clock}
              label="Hours Done"
              value={`${stats.totalActualHours.toFixed(1)}h`}
              sub={`Required: ${stats.requiredHours.toFixed(1)}h`}
              warn={stats.hoursDeficit > 5}
              colorVar={stats.hoursDeficit > 5 ? "var(--danger)" : "var(--success)"}
            />
            <StatChip
              icon={AlertCircle}
              label="Late Sessions"
              value={String(stats.lateSessions)}
              sub={stats.lateSessions > 5 ? "⚠ Threshold exceeded" : `${5 - stats.lateSessions} remaining`}
              warn={stats.lateSessions > 5}
              colorVar={stats.lateSessions > 5 ? "var(--danger)" : "var(--warning)"}
            />
            <StatChip
              icon={CheckCircle2}
              label="Completed"
              value={`${stats.totalCompletedSessions}/${stats.totalScheduledSessions}`}
              sub="sessions this month"
              colorVar="var(--accent)"
            />
          </div>

          {/* Commission estimate — gradient card */}
          <div className="metric-card-indigo rounded-xl p-5 text-white">
            <div className="text-sm opacity-80 mb-1">Estimated Commission — {MONTHS[month-1]} {year}</div>
            <div className="text-3xl font-bold mb-4">{formatCurrency(stats.netCommission)}</div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-white/10 rounded-lg p-2.5 text-center">
                <div className="opacity-70 text-xs mb-0.5">Base</div>
                <div className="font-semibold">{formatCurrency(stats.estimatedCommission)}</div>
              </div>
              <div className={`rounded-lg p-2.5 text-center ${stats.hoursDeduction > 0 ? "bg-red-500/30" : "bg-white/10"}`}>
                <div className="opacity-70 text-xs mb-0.5">Hours Deduction</div>
                <div className="font-semibold">{stats.hoursDeduction > 0 ? `-${formatCurrency(stats.hoursDeduction)}` : "–"}</div>
              </div>
              <div className={`rounded-lg p-2.5 text-center ${stats.punctualityDeduction > 0 ? "bg-red-500/30" : "bg-white/10"}`}>
                <div className="opacity-70 text-xs mb-0.5">Punctuality Deduction</div>
                <div className="font-semibold">{stats.punctualityDeduction > 0 ? `-${formatCurrency(stats.punctualityDeduction)}` : "–"}</div>
              </div>
            </div>
          </div>

          {/* Punctuality breakdown */}
          <div className="section-card p-5">
            <h2 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Punctuality Breakdown</h2>
            <div className="space-y-3">
              {[
                { label: "Early (5+ min early)", count: stats.earlySessions, colorVar: "var(--accent)" },
                { label: "On Time", count: stats.onTimeSessions, colorVar: "var(--success)" },
                { label: "Late", count: stats.lateSessions, colorVar: "var(--warning)" },
                { label: "Missed", count: stats.missedSessions, colorVar: "var(--danger)" },
              ].map((row) => {
                const total = stats.totalScheduledSessions || 1;
                return (
                  <div key={row.label} className="flex items-center gap-3">
                    <div className="w-36 text-sm flex-shrink-0" style={{ color: "var(--text-secondary)" }}>{row.label}</div>
                    <div className="flex-1 progress-track">
                      <div
                        className="progress-fill"
                        style={{ width: `${(row.count / total) * 100}%`, background: row.colorVar }}
                      />
                    </div>
                    <div className="w-6 text-sm font-semibold text-right" style={{ color: row.colorVar }}>{row.count}</div>
                  </div>
                );
              })}
            </div>
            {stats.lateSessions > 5 && (
              <div className="alert alert-danger mt-3">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>{stats.lateSessions} late sessions exceeds the 5-session threshold → -0.5% commission deduction applied</span>
              </div>
            )}
          </div>

          {/* Hours tracking */}
          <div className="section-card p-5">
            <h2 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Hours Tracking</h2>
            <div className="space-y-3">
              <div className="kv-row">
                <span className="kv-label">Required hours this month</span>
                <span className="kv-value">{stats.requiredHours.toFixed(1)}h</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">Actual hours completed</span>
                <span
                  className="kv-value"
                  style={{ color: stats.hoursDeficit > 5 ? "var(--danger)" : "var(--success)" }}
                >
                  {stats.totalActualHours.toFixed(1)}h
                </span>
              </div>
              <div className="progress-track" style={{ height: "10px" }}>
                <div
                  className="progress-fill"
                  style={{
                    width: `${Math.min(100, (stats.totalActualHours / (stats.requiredHours || 1)) * 100)}%`,
                    background: stats.hoursDeficit > 5 ? "var(--danger)" : "var(--success)",
                    height: "10px",
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-muted)" }}>
                <span>{((stats.totalActualHours / (stats.requiredHours || 1)) * 100).toFixed(0)}% completed</span>
                {stats.hoursDeficit > 0 && (
                  <span style={{ color: stats.hoursDeficit > 5 ? "var(--danger)" : "var(--text-muted)", fontWeight: stats.hoursDeficit > 5 ? 600 : 400 }}>
                    Deficit: {stats.hoursDeficit.toFixed(1)}h
                  </span>
                )}
              </div>
              {stats.hoursDeficit > 5 && (
                <div className="alert alert-danger">
                  <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>Hours deficit exceeds 5h threshold → -0.5% commission deduction</span>
                </div>
              )}
            </div>
          </div>

          {/* KPI by brand */}
          {stats.byBrand.length > 0 && (
            <div className="section-card p-5">
              <h2 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>KPI by Brand</h2>
              <div className="space-y-3">
                {stats.byBrand.map((b) => (
                  <div
                    key={b.brandId}
                    className="rounded-lg p-4"
                    style={{ border: "1px solid var(--border)", background: "var(--bg-subtle)" }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="font-medium" style={{ color: "var(--text-primary)" }}>{b.brandName}</div>
                      <TierBadge tier={b.kpiAchievedTier} />
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <div className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>GMV/hr (Normal Days)</div>
                        <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{formatCurrency(b.normalDayGMVPerHour)}</div>
                        {b.tier1KpiNormal > 0 && (
                          <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                            T1: {formatCurrency(b.tier1KpiNormal)} · T2: {formatCurrency(b.tier2KpiNormal)}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Total GMV</div>
                        <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{formatCurrency(b.totalGMV)}</div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{b.completedSessions} sessions · {b.totalHours.toFixed(1)}h</div>
                      </div>
                      <div>
                        <div className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Est. Commission</div>
                        <div className="font-semibold" style={{ color: "var(--success)" }}>{formatCurrency(b.estimatedCommission)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatChip({ icon: Icon, label, value, sub, colorVar, warn }: {
  icon: React.ElementType; label: string; value: string; sub?: string; colorVar: string; warn?: boolean;
}) {
  return (
    <div
      className="section-card p-4"
      style={warn ? { borderColor: "var(--danger)" } : {}}
    >
      <div
        className="inline-flex p-2 rounded-lg mb-2"
        style={{ background: colorVar + "18", color: colorVar }}
      >
        <Icon size={16} />
      </div>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-xl font-bold mt-0.5" style={{ color: warn ? "var(--danger)" : colorVar }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

function TierBadge({ tier }: { tier: 0 | 1 | 2 }) {
  if (tier === 2) return <Badge variant="success">Tier 2 ✓</Badge>;
  if (tier === 1) return <Badge variant="warning">Tier 1</Badge>;
  return <Badge variant="secondary">Below KPI</Badge>;
}
