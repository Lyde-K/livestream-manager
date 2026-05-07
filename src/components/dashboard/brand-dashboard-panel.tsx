"use client";

import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, Minus, Target, Users,
  AlertTriangle, DollarSign,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TopHost {
  name: string;
  sessions: number;
  gmv: number;
  gmvPerHour: number;
  hours: number;
  adsCost: number;
}

interface MonthTrend {
  month: number;
  year: number;
  label: string;
  gmv: number;
  hours: number;
  adsCost: number;
  sessions: number;
}

interface AdsSession {
  id: string;
  date: string;
  gmv: number;
  adsCost: number;
  adsRatio?: number;
  hostName: string;
}

interface BrandDashboardData {
  topHosts: TopHost[];
  monthlyTrend: MonthTrend[];
  noAdsSessions: AdsSession[];
  highAdsSessions: AdsSession[];
}

interface Props {
  brandId: string;
  brandName: string;
  brandColor: string;
  month: number;
  year: number;
  currentGMV: number;
}

const HOST_MEDALS = ["🥇", "🥈", "🥉", "4", "5"];

// ── Component ──────────────────────────────────────────────────────────────────

export function BrandDashboardPanel({
  brandId, brandName, brandColor, month, year, currentGMV,
}: Props) {
  const [data, setData]           = useState<BrandDashboardData | null>(null);
  const [target, setTarget]       = useState<number>(0);
  const [editTarget, setEditTarget] = useState(false);
  const [targetInput, setTargetInput] = useState("");
  const [loading, setLoading]     = useState(true);
  const [savingTarget, setSavingTarget] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, tgtRes] = await Promise.all([
        fetch(`/api/brand-dashboard?brandId=${brandId}&month=${month}&year=${year}`),
        fetch(`/api/gmv-target?brandId=${brandId}&month=${month}&year=${year}`),
      ]);
      const dash = await dashRes.json() as { success: boolean; data: BrandDashboardData };
      const tgt  = await tgtRes.json()  as { success: boolean; data: { target: number } | null };
      if (dash.success) setData(dash.data);
      if (tgt.success && tgt.data) {
        setTarget(tgt.data.target);
        setTargetInput(String(tgt.data.target));
      } else {
        setTarget(0);
        setTargetInput("");
      }
    } finally {
      setLoading(false);
    }
  }, [brandId, month, year]);

  useEffect(() => { void loadData(); }, [loadData]);

  const saveTarget = async () => {
    const val = parseFloat(targetInput.replace(/,/g, ""));
    if (isNaN(val) || val < 0) return;
    setSavingTarget(true);
    try {
      const res  = await fetch("/api/gmv-target", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, month, year, target: val }),
      });
      const json = await res.json() as { success: boolean };
      if (json.success) { setTarget(val); setEditTarget(false); }
    } finally {
      setSavingTarget(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="section-card h-32 animate-pulse" style={{ background: "var(--bg-subtle)" }} />
        ))}
      </div>
    );
  }

  if (!data) return null;

  // ── GMV Target circular progress ───────────────────────────────────────────
  const progressPct       = target > 0 ? Math.min((currentGMV / target) * 100, 100) : 0;
  const RADIUS            = 54;
  const circumference     = 2 * Math.PI * RADIUS;
  const strokeDashoffset  = circumference - (progressPct / 100) * circumference;

  // ── Run-rate ───────────────────────────────────────────────────────────────
  const now           = new Date();
  const isCurrentMonth = now.getMonth() === month && now.getFullYear() === year;
  const daysInMonth   = new Date(year, month + 1, 0).getDate();
  const daysPassed    = isCurrentMonth ? now.getDate() : daysInMonth;
  const runRateGMV    = daysPassed > 0 ? (currentGMV / daysPassed) * daysInMonth : 0;

  // ── Monthly trend ──────────────────────────────────────────────────────────
  const trendMonths = data.monthlyTrend;
  const maxGMV      = Math.max(...trendMonths.map(t => t.gmv), 1);
  const prevMonth   = trendMonths[trendMonths.length - 2];
  const curMonth    = trendMonths[trendMonths.length - 1];
  const trendDiff   = prevMonth && prevMonth.gmv > 0
    ? ((curMonth.gmv - prevMonth.gmv) / prevMonth.gmv) * 100
    : null;

  return (
    <div className="space-y-4">

      {/* ── Row 1: GMV Target + 6-Month Trend ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* GMV Target Tracker */}
        <div className="section-card">
          <div className="section-card-header">
            <h2 className="flex items-center gap-1.5 text-sm">
              <Target size={13} style={{ color: brandColor }} />
              GMV Target — {format(new Date(year, month, 1), "MMM yyyy")}
            </h2>
            <button
              onClick={() => { setEditTarget(true); setTargetInput(target > 0 ? String(target) : ""); }}
              className="text-xs font-medium hover:opacity-70 transition-opacity"
              style={{ color: "var(--accent)" }}
            >
              {target > 0 ? "Edit" : "Set Target"}
            </button>
          </div>

          <div className="px-4 pb-4">
            {editTarget ? (
              <div className="flex items-center gap-2 py-4">
                <input
                  type="number"
                  value={targetInput}
                  onChange={e => setTargetInput(e.target.value)}
                  placeholder="e.g. 100000"
                  className="flex-1 px-3 py-2 rounded-lg text-sm border"
                  style={{
                    background: "var(--bg-input, var(--bg-subtle))",
                    borderColor: "var(--border)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                  autoFocus
                  onKeyDown={e => { if (e.key === "Enter") void saveTarget(); }}
                />
                <button
                  onClick={() => void saveTarget()}
                  disabled={savingTarget}
                  className="px-3 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                  style={{ background: "var(--accent)" }}
                >
                  {savingTarget ? "…" : "Save"}
                </button>
                <button
                  onClick={() => setEditTarget(false)}
                  className="px-3 py-2 rounded-lg text-xs"
                  style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
                >
                  Cancel
                </button>
              </div>
            ) : target > 0 ? (
              <div className="flex items-center gap-5 pt-1">
                {/* Circular SVG progress */}
                <div className="relative flex-shrink-0">
                  <svg width="140" height="140" viewBox="0 0 140 140">
                    {/* Track */}
                    <circle cx="70" cy="70" r={RADIUS} fill="none" strokeWidth="10"
                      stroke="var(--bg-subtle)" />
                    {/* Progress arc */}
                    <circle
                      cx="70" cy="70" r={RADIUS}
                      fill="none"
                      strokeWidth="10"
                      stroke={brandColor}
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      transform="rotate(-90 70 70)"
                      style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(.4,0,.2,1)" }}
                    />
                    {/* Centre labels */}
                    <text x="70" y="63" textAnchor="middle" dominantBaseline="middle"
                      fontSize="20" fontWeight="700" fill="var(--text-primary)">
                      {progressPct.toFixed(0)}%
                    </text>
                    <text x="70" y="82" textAnchor="middle" dominantBaseline="middle"
                      fontSize="10" fill="var(--text-muted)">
                      of target
                    </text>
                  </svg>
                </div>

                {/* Stats */}
                <div className="space-y-2.5 flex-1 min-w-0">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>MTD GMV</p>
                    <p className="text-lg font-bold leading-tight" style={{ color: "var(--text-primary)" }}>{formatCurrency(currentGMV)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>Target</p>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>{formatCurrency(target)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>
                      Run Rate ({daysPassed}d/{daysInMonth}d)
                    </p>
                    <p className="text-sm font-bold" style={{ color: runRateGMV >= target ? "var(--success)" : "var(--warning)" }}>
                      {formatCurrency(runRateGMV)}
                      <span className="text-[10px] font-normal ml-1" style={{ color: "var(--text-muted)" }}>projected</span>
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Target size={32} className="mx-auto mb-2" style={{ color: "var(--text-muted)", opacity: 0.4 }} />
                <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>No target set for this month</p>
                <button
                  onClick={() => { setEditTarget(true); setTargetInput(""); }}
                  className="text-xs font-semibold px-4 py-1.5 rounded-full transition-opacity hover:opacity-80"
                  style={{ background: brandColor + "22", color: brandColor }}
                >
                  Set GMV Target
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 6-Month GMV Trend */}
        <div className="section-card">
          <div className="section-card-header">
            <h2 className="flex items-center gap-1.5 text-sm">
              {trendDiff !== null && trendDiff > 0
                ? <TrendingUp  size={13} style={{ color: "var(--success)" }} />
                : trendDiff !== null && trendDiff < 0
                ? <TrendingDown size={13} style={{ color: "var(--danger)"  }} />
                : <Minus size={13} style={{ color: "var(--text-muted)" }} />
              }
              6-Month GMV Trend
            </h2>
            {trendDiff !== null && (
              <span
                className="text-xs font-bold"
                style={{ color: trendDiff > 0 ? "var(--success)" : trendDiff < 0 ? "var(--danger)" : "var(--text-muted)" }}
              >
                {trendDiff > 0 ? "+" : ""}{trendDiff.toFixed(1)}% MoM
              </span>
            )}
          </div>

          <div className="px-3 pb-4">
            {/* Chart — bars aligned to bottom, labels float above each bar */}
            <div className="flex gap-2" style={{ height: "160px", paddingTop: "44px", position: "relative" }}>
              {trendMonths.map((m, i) => {
                const pct        = maxGMV > 0 ? (m.gmv / maxGMV) * 100 : 0;
                const barPct     = Math.max(pct, m.gmv > 0 ? 3 : 0.5);
                const isSelected = m.month === month && m.year === year;
                const prev       = i > 0 ? trendMonths[i - 1] : null;
                const mom        = prev && prev.gmv > 0
                  ? ((m.gmv - prev.gmv) / prev.gmv) * 100
                  : null;

                return (
                  <div key={i} className="flex-1 flex flex-col items-center" style={{ position: "relative", height: "100%" }}>
                    {/* Labels floating above the bar */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: `calc(${barPct}% + 6px)`,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "1px",
                        width: "100%",
                      }}
                    >
                      {mom !== null && (
                        <span
                          style={{
                            fontSize: "8px",
                            fontWeight: 700,
                            lineHeight: 1.2,
                            color: mom >= 0 ? "var(--success)" : "var(--danger)",
                          }}
                        >
                          {mom > 0 ? "+" : ""}{mom.toFixed(0)}%
                        </span>
                      )}
                      {m.gmv > 0 && (
                        <span style={{ fontSize: "8px", lineHeight: 1.2, color: "var(--text-muted)" }}>
                          {m.gmv >= 1000
                            ? `${(m.gmv / 1000).toFixed(0)}k`
                            : `${m.gmv.toFixed(0)}`}
                        </span>
                      )}
                    </div>

                    {/* Bar — anchored to bottom */}
                    <div style={{ position: "absolute", bottom: 0, width: "100%" }}>
                      <div
                        className="rounded-t transition-all"
                        style={{
                          height: `${barPct}%`,
                          width: "100%",
                          background: isSelected ? brandColor : brandColor + "50",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Month labels */}
            <div className="flex gap-2 mt-1.5">
              {trendMonths.map((m, i) => {
                const isSelected = m.month === month && m.year === year;
                return (
                  <div key={i} className="flex-1 text-center">
                    <span
                      className="text-[9px] font-medium"
                      style={{ color: isSelected ? "var(--text-primary)" : "var(--text-muted)" }}
                    >
                      {m.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 2: Top Hosts ── */}
      {data.topHosts.length > 0 && (
        <div className="section-card">
          <div className="section-card-header">
            <h2 className="flex items-center gap-1.5 text-sm">
              <Users size={13} style={{ color: brandColor }} />
              Top Hosts — {brandName}
            </h2>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {format(new Date(year, month, 1), "MMMM yyyy")}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table text-xs w-full">
              <thead>
                <tr>
                  <th className="text-left">Host</th>
                  <th className="text-right">Sessions</th>
                  <th className="text-right">Hours</th>
                  <th className="text-right">GMV</th>
                  <th className="text-right">GMV/hr</th>
                  <th className="text-right">Ads Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.topHosts.map((h, i) => (
                  <tr key={h.name}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="text-sm w-4 text-center">{HOST_MEDALS[i] ?? String(i + 1)}</span>
                        <span className="font-medium" style={{ color: "var(--text-primary)" }}>{h.name}</span>
                      </div>
                    </td>
                    <td className="text-right" style={{ color: "var(--text-secondary)" }}>{h.sessions}</td>
                    <td className="text-right" style={{ color: "var(--text-secondary)" }}>{h.hours.toFixed(1)}h</td>
                    <td className="text-right font-semibold" style={{ color: "var(--text-primary)" }}>{formatCurrency(h.gmv)}</td>
                    <td className="text-right" style={{ color: "var(--text-secondary)" }}>
                      {h.gmvPerHour > 0 ? formatCurrency(h.gmvPerHour) : "—"}
                    </td>
                    <td className="text-right" style={{ color: "var(--text-muted)" }}>
                      {h.adsCost > 0 ? formatCurrency(h.adsCost) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Row 3: Ads Analysis ── */}
      {(data.noAdsSessions.length > 0 || data.highAdsSessions.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* No Ads Sessions */}
          {data.noAdsSessions.length > 0 && (
            <div className="section-card">
              <div className="section-card-header">
                <h2 className="flex items-center gap-1.5 text-sm">
                  <DollarSign size={13} style={{ color: "var(--text-muted)" }} />
                  Sessions Without Ads Spend
                </h2>
                <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                  {data.noAdsSessions.length}
                </span>
              </div>
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {data.noAdsSessions.slice(0, 6).map(s => (
                  <div key={s.id} className="flex items-center justify-between px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{s.hostName}</p>
                      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {format(new Date(s.date), "d MMM, HH:mm")}
                      </p>
                    </div>
                    <p className="text-xs font-semibold ml-3 flex-shrink-0" style={{ color: "var(--text-secondary)" }}>
                      {formatCurrency(s.gmv)}
                    </p>
                  </div>
                ))}
                {data.noAdsSessions.length > 6 && (
                  <p className="px-3 py-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    +{data.noAdsSessions.length - 6} more
                  </p>
                )}
              </div>
            </div>
          )}

          {/* High Ads Ratio Sessions */}
          {data.highAdsSessions.length > 0 && (
            <div className="section-card">
              <div className="section-card-header">
                <h2 className="flex items-center gap-1.5 text-sm">
                  <AlertTriangle size={13} style={{ color: "var(--warning)" }} />
                  High Ads Spend Ratio (&gt;40%)
                </h2>
                <span className="text-xs font-bold" style={{ color: "var(--warning)" }}>
                  {data.highAdsSessions.length}
                </span>
              </div>
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {data.highAdsSessions.slice(0, 6).map(s => (
                  <div key={s.id} className="flex items-center justify-between px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{s.hostName}</p>
                      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {format(new Date(s.date), "d MMM, HH:mm")} · GMV {formatCurrency(s.gmv)}
                      </p>
                    </div>
                    <span className="text-xs font-bold ml-3 flex-shrink-0" style={{ color: "var(--danger)" }}>
                      {s.adsRatio?.toFixed(0)}%
                    </span>
                  </div>
                ))}
                {data.highAdsSessions.length > 6 && (
                  <p className="px-3 py-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    +{data.highAdsSessions.length - 6} more
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
