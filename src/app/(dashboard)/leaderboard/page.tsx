"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Trophy, TrendingUp, TrendingDown, Minus, Target } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type PeriodType = "month" | "quarter" | "halfyear" | "year";

interface HostEntry {
  hostId: string;
  displayName: string;
  type: string;
  rank: number;
  sessionCount: number;
  completedCount: number;
  // performance
  gmvPerHour: number | null;
  prevGmvPerHour: number | null;
  gmvHourGrowth: number | null;
  // consistency
  completionRate: number | null;
  onTimeRate: number | null;
  consistencyScore: number | null;
}

interface LeaderboardData {
  label: string;
  prevLabel: string;
  performance: HostEntry[];
  consistency: HostEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(v: number | null) {
  if (v === null) return "—";
  return `${v.toFixed(1)}%`;
}

function GrowthPill({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs" style={{ color: "var(--text-muted)" }}>No prev. data</span>;
  const pos = value >= 0;
  const Icon = Math.abs(value) < 0.5 ? Minus : pos ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{
        background: pos ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
        color: pos ? "var(--success)" : "var(--danger)",
        border: `1px solid ${pos ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
      }}>
      <Icon size={11} />{value >= 0 ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-lg leading-none">🥇</span>;
  if (rank === 2) return <span className="text-lg leading-none">🥈</span>;
  if (rank === 3) return <span className="text-lg leading-none">🥉</span>;
  return (
    <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
      style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
      #{rank}
    </span>
  );
}

// ─── Period navigation ────────────────────────────────────────────────────────

function periodStep(period: PeriodType, month: number, year: number, dir: 1 | -1) {
  const steps: Record<PeriodType, number> = { month: 1, quarter: 3, halfyear: 6, year: 12 };
  const offset = steps[period] * dir;
  const d = new Date(year, month + offset, 1);
  return { month: d.getMonth(), year: d.getFullYear() };
}

function canGoForward(period: PeriodType, month: number, year: number) {
  const now = new Date();
  const { month: nm, year: ny } = periodStep(period, month, year, 1);
  return new Date(ny, nm, 1) <= new Date(now.getFullYear(), now.getMonth(), 1);
}

function PeriodNav({ period, month, year }: { period: PeriodType; month: number; year: number }) {
  const router = useRouter();
  const now = new Date();

  function go(dir: 1 | -1) {
    const { month: nm, year: ny } = periodStep(period, month, year, dir);
    router.push(`/leaderboard?period=${period}&month=${nm}&year=${ny}`);
  }

  // Month dropdown options (18 months)
  const monthOptions: { month: number; year: number; label: string }[] = [];
  for (let i = 0; i < 18; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthOptions.push({ month: d.getMonth(), year: d.getFullYear(), label: d.toLocaleString("default", { month: "long", year: "numeric" }) });
  }

  function onMonthSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const [m, y] = e.target.value.split("-").map(Number);
    router.push(`/leaderboard?period=${period}&month=${m}&year=${y}`);
  }

  const canFwd = canGoForward(period, month, year);

  if (period === "month") {
    const oldest = monthOptions[monthOptions.length - 1];
    const canBack = !(month === oldest.month && year === oldest.year);
    return (
      <div className="flex items-center gap-1.5">
        <button onClick={() => go(-1)} disabled={!canBack} className="p-1 rounded-md disabled:opacity-30"
          style={{ color: "var(--text-secondary)", background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
          <ChevronLeft size={14} />
        </button>
        <select value={`${month}-${year}`} onChange={onMonthSelect}
          className="text-sm font-semibold px-2 py-1 rounded-md outline-none cursor-pointer"
          style={{ background: "var(--bg-subtle)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
          {monthOptions.map(o => (
            <option key={`${o.month}-${o.year}`} value={`${o.month}-${o.year}`}>{o.label}</option>
          ))}
        </select>
        <button onClick={() => go(1)} disabled={!canFwd} className="p-1 rounded-md disabled:opacity-30"
          style={{ color: "var(--text-secondary)", background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
          <ChevronRight size={14} />
        </button>
      </div>
    );
  }

  // Quarter / Half Year / Year — just prev/next arrows
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={() => go(-1)} className="p-1 rounded-md"
        style={{ color: "var(--text-secondary)", background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
        <ChevronLeft size={14} />
      </button>
      <button onClick={() => go(1)} disabled={!canFwd} className="p-1 rounded-md disabled:opacity-30"
        style={{ color: "var(--text-secondary)", background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

// ─── Mini podium (top 3 highlight rows) ──────────────────────────────────────

function TopThree({ entries, renderMetric }: {
  entries: HostEntry[];
  renderMetric: (h: HostEntry) => React.ReactNode;
}) {
  const top = entries.slice(0, 3);
  if (top.length === 0) return null;
  const colors = [
    "rgba(251,191,36,0.08)",
    "rgba(148,163,184,0.08)",
    "rgba(180,83,9,0.06)",
  ];
  const borders = [
    "rgba(251,191,36,0.2)",
    "rgba(148,163,184,0.2)",
    "rgba(180,83,9,0.15)",
  ];
  return (
    <div className="grid grid-cols-3 gap-2 p-3">
      {top.map((h, i) => (
        <div key={h.hostId} className="rounded-xl p-3 text-center space-y-1.5"
          style={{ background: colors[i], border: `1px solid ${borders[i]}` }}>
          <div className="flex justify-center"><RankBadge rank={h.rank} /></div>
          <div className="text-xs font-bold truncate" style={{ color: "var(--text-primary)" }}>{h.displayName}</div>
          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{h.type.replace("_", " ")}</div>
          <div>{renderMetric(h)}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Ranking table ────────────────────────────────────────────────────────────

function RankTable({ entries, headers, renderRow }: {
  entries: HostEntry[];
  headers: string[];
  renderRow: (h: HostEntry) => React.ReactNode[];
}) {
  if (entries.length === 0) return (
    <div className="p-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>No data for this period.</div>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr style={{ background: "var(--bg-subtle)", borderBottom: "1px solid var(--border)" }}>
            {headers.map(h => (
              <th key={h} className="px-3 py-2 text-left text-xs font-semibold whitespace-nowrap"
                style={{ color: "var(--text-secondary)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((h, i) => {
            const cells = renderRow(h);
            return (
              <tr key={h.hostId} style={{
                borderBottom: "1px solid var(--border)",
                background: h.rank <= 3 ? "rgba(251,191,36,0.02)" : undefined,
              }}>
                <td className="px-3 py-2.5"><RankBadge rank={h.rank} /></td>
                <td className="px-3 py-2.5">
                  <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{h.displayName}</div>
                  <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{h.type.replace("_", " ")}</div>
                </td>
                <td className="px-3 py-2.5 text-xs text-center" style={{ color: "var(--text-secondary)" }}>
                  {h.completedCount}/{h.sessionCount}
                </td>
                {cells.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2.5">{cell}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const PERIOD_TABS: { key: PeriodType; label: string }[] = [
  { key: "month",    label: "Month"     },
  { key: "quarter",  label: "Quarter"   },
  { key: "halfyear", label: "Half Year" },
  { key: "year",     label: "Year"      },
];

export default function LeaderboardPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const now = new Date();

  const period = (searchParams.get("period") ?? "month") as PeriodType;
  const month  = parseInt(searchParams.get("month") ?? String(now.getMonth()));
  const year   = parseInt(searchParams.get("year")  ?? String(now.getFullYear()));

  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/leaderboard?period=${period}&month=${month}&year=${year}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [period, month, year]);

  useEffect(() => { load(); }, [load]);

  function changePeriod(p: PeriodType) {
    router.push(`/leaderboard?period=${p}&month=${month}&year=${year}`);
  }

  const perfTotal = data?.performance.length ?? 0;
  const consTotal = data?.consistency.length ?? 0;

  return (
    <div className="space-y-5 animate-in max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Trophy size={20} style={{ color: "#f59e0b" }} />
            Live Host Leaderboard
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {data ? `${data.label} — compared to ${data.prevLabel}` : "Loading…"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Period type tabs */}
          <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
            {PERIOD_TABS.map(t => (
              <button key={t.key} onClick={() => changePeriod(t.key)}
                className="px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer"
                style={period === t.key
                  ? { background: "var(--accent)", color: "#fff" }
                  : { color: "var(--text-secondary)" }}>
                {t.label}
              </button>
            ))}
          </div>
          {/* Period navigation */}
          <PeriodNav period={period} month={month} year={year} />
        </div>
      </div>

      {loading ? (
        <div className="section-card p-16 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          Loading leaderboard…
        </div>
      ) : !data || (data.performance.length === 0 && data.consistency.length === 0) ? (
        <div className="section-card p-16 text-center">
          <Trophy size={32} className="mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>No data for this period</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Sessions will appear once synced.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

          {/* ── Performance Leaderboard ── */}
          <div className="section-card overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between"
              style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2">
                <TrendingUp size={15} style={{ color: "var(--success)" }} />
                <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Performance</span>
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "var(--bg-subtle)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                  {perfTotal} host{perfTotal !== 1 ? "s" : ""}
                </span>
              </div>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Ranked by GMV/hr growth</span>
            </div>

            {/* Top 3 highlight */}
            {data.performance.length >= 2 && (
              <TopThree entries={data.performance} renderMetric={h => <GrowthPill value={h.gmvHourGrowth} />} />
            )}

            <RankTable
              entries={data.performance}
              headers={["Rank", "Host", "Sessions", `GMV/hr (${data.label})`, `vs ${data.prevLabel}`]}
              renderRow={h => [
                <span key="gmv" className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                  {h.gmvPerHour !== null ? `${formatCurrency(h.gmvPerHour)}/hr` : "—"}
                </span>,
                <GrowthPill key="growth" value={h.gmvHourGrowth} />,
              ]}
            />
            <div className="px-4 py-2 border-t text-[11px]" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)", color: "var(--text-muted)" }}>
              GMV/hr = Total GMV ÷ actual hours worked · Growth = vs same metric in {data.prevLabel}
            </div>
          </div>

          {/* ── Consistency Leaderboard ── */}
          <div className="section-card overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between"
              style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2">
                <Target size={15} style={{ color: "var(--accent)" }} />
                <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Consistency</span>
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "var(--bg-subtle)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                  {consTotal} host{consTotal !== 1 ? "s" : ""}
                </span>
              </div>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>50% completion + 50% on-time</span>
            </div>

            {/* Top 3 highlight */}
            {data.consistency.length >= 2 && (
              <TopThree entries={data.consistency} renderMetric={h => (
                <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>
                  {pct(h.consistencyScore)}
                </span>
              )} />
            )}

            <RankTable
              entries={data.consistency}
              headers={["Rank", "Host", "Sessions", "Completion", "On-Time", "Score"]}
              renderRow={h => [
                // Completion
                <div key="comp" className="text-center">
                  <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{pct(h.completionRate)}</div>
                </div>,
                // On-Time
                <div key="ot" className="text-center">
                  <div className="font-semibold text-sm" style={{
                    color: h.onTimeRate !== null
                      ? h.onTimeRate >= 80 ? "var(--success)" : h.onTimeRate >= 60 ? "var(--warning)" : "var(--danger)"
                      : "var(--text-muted)",
                  }}>
                    {pct(h.onTimeRate)}
                  </div>
                </div>,
                // Score
                <div key="score" className="text-center">
                  <span className="text-sm font-bold px-2 py-0.5 rounded-full"
                    style={{
                      background: h.consistencyScore !== null && h.consistencyScore >= 90
                        ? "rgba(34,197,94,0.1)" : "var(--bg-subtle)",
                      color: h.consistencyScore !== null && h.consistencyScore >= 90
                        ? "var(--success)" : "var(--text-primary)",
                    }}>
                    {pct(h.consistencyScore)}
                  </span>
                </div>,
              ]}
            />
            <div className="px-4 py-2 border-t text-[11px]" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)", color: "var(--text-muted)" }}>
              On-time rate requires pre-scheduled sessions. If blank, score = completion rate only.
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
