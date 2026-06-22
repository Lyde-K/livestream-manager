"use client";

import { useEffect, useState, useCallback } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { ArrowUpRight, Eye, ShoppingCart, TrendingUp, Zap } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface BrandRow {
  brandId: string;
  brandName: string;
  color: string;
  platform: string;
  gmv: number;
  viewers: number;
  sessions: number;
  orders: number;
  avgCTOR: number | null;
}

interface AnalyticsData {
  totalGMV: number;
  totalViewers: number;
  totalOrders: number;
  avgCTOR: number | null;
  sessionCount: number;
  byBrand: BrandRow[];
  byType: {
    bau: { sessions: number; gmv: number };
    campaign: { sessions: number; gmv: number };
  };
}

interface Props {
  month: number;
  year: number;
}

const medals = ["🥇", "🥈", "🥉"];

// ── Component ──────────────────────────────────────────────────────────────────

export function AllBrandsAnalyticsPanel({ month, year }: Props) {
  const [data, setData]     = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const start = format(startOfMonth(new Date(year, month, 1)), "yyyy-MM-dd");
      const end   = format(endOfMonth(new Date(year, month, 1)), "yyyy-MM-dd");
      const res   = await fetch(`/api/analytics?start=${start}&end=${end}&type=ALL`);
      const json  = await res.json() as { success?: boolean } & Partial<AnalyticsData>;
      if (json.totalGMV !== undefined) setData(json as AnalyticsData);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="section-card animate-pulse h-48" style={{ background: "var(--bg-subtle)" }} />
    );
  }

  if (!data) return null;

  const totalBrandGMV = data.byBrand.reduce((s, b) => s + b.gmv, 0) || 1;
  const bauPct     = data.byType
    ? Math.round((data.byType.bau.gmv / (data.totalGMV || 1)) * 100)
    : null;
  const campaignPct = data.byType
    ? 100 - (bauPct ?? 0)
    : null;

  return (
    <div className="section-card">
      <div className="section-card-header">
        <h2 className="flex items-center gap-1.5 text-sm">
          <TrendingUp size={13} style={{ color: "var(--accent)" }} />
          Analytics — {format(new Date(year, month, 1), "MMMM yyyy")}
        </h2>
        <Link
          href="/performance"
          className="flex items-center gap-1 text-xs font-medium"
          style={{ color: "var(--accent)" }}
        >
          Full view <ArrowUpRight size={11} />
        </Link>
      </div>

      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px" style={{ borderTop: "1px solid var(--border)" }}>
        {[
          { label: "Total GMV",    value: formatCurrency(data.totalGMV),  icon: TrendingUp },
          { label: "Sessions",     value: String(data.sessionCount),       icon: Zap },
          { label: "Viewers",      value: fmtNum(data.totalViewers),       icon: Eye },
          { label: "Avg CTOR",     value: data.avgCTOR != null ? `${(data.avgCTOR * 100).toFixed(1)}%` : "—", icon: ShoppingCart },
        ].map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="px-4 py-3 flex items-center gap-3"
            style={{ borderRight: "1px solid var(--border)" }}
          >
            <Icon size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <div>
              <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>{label}</p>
              <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── BAU vs Campaign strip ── */}
      {data.byType && (data.byType.bau.sessions + data.byType.campaign.sessions) > 0 && (
        <div className="px-4 py-2.5 flex items-center gap-4" style={{ borderTop: "1px solid var(--border)", background: "var(--bg-subtle)" }}>
          <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-muted)" }}>Session Mix</span>
          <div className="flex-1 flex gap-3">
            <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
              BAU&nbsp;
              <span style={{ color: "var(--text-primary)" }}>{data.byType.bau.sessions}sess</span>
              <span className="ml-1 text-[10px]" style={{ color: "var(--text-muted)" }}>·&nbsp;{formatCurrency(data.byType.bau.gmv)}&nbsp;({bauPct}%)</span>
            </span>
            <span className="text-[10px]" style={{ color: "var(--border)" }}>|</span>
            <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
              Campaign&nbsp;
              <span style={{ color: "var(--text-primary)" }}>{data.byType.campaign.sessions}sess</span>
              <span className="ml-1 text-[10px]" style={{ color: "var(--text-muted)" }}>·&nbsp;{formatCurrency(data.byType.campaign.gmv)}&nbsp;({campaignPct}%)</span>
            </span>
          </div>
        </div>
      )}

      {/* ── Brand breakdown table ── */}
      <div className="overflow-x-auto">
        <table className="data-table text-xs w-full">
          <thead>
            <tr>
              <th className="text-left">Brand</th>
              <th className="text-right">Sessions</th>
              <th className="text-right">GMV</th>
              <th className="text-right">GMV %</th>
              <th className="text-right">Viewers</th>
              <th className="text-right">Orders</th>
              <th className="text-right">Avg CTOR</th>
            </tr>
          </thead>
          <tbody>
            {data.byBrand.map((b, i) => {
              const gmvShare = Math.round((b.gmv / totalBrandGMV) * 100);
              return (
                <tr key={b.brandId}>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm w-4">{medals[i] ?? ""}</span>
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: b.color }} />
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>{b.brandName}</span>
                    </div>
                  </td>
                  <td className="text-right" style={{ color: "var(--text-secondary)" }}>{b.sessions}</td>
                  <td className="text-right font-semibold" style={{ color: "var(--text-primary)" }}>{formatCurrency(b.gmv)}</td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-subtle)" }}>
                        <div className="h-full rounded-full" style={{ width: `${gmvShare}%`, background: b.color }} />
                      </div>
                      <span style={{ color: "var(--text-muted)" }}>{gmvShare}%</span>
                    </div>
                  </td>
                  <td className="text-right" style={{ color: "var(--text-secondary)" }}>{b.viewers > 0 ? fmtNum(b.viewers) : "—"}</td>
                  <td className="text-right" style={{ color: "var(--text-secondary)" }}>{b.orders > 0 ? b.orders : "—"}</td>
                  <td className="text-right" style={{ color: "var(--text-muted)" }}>
                    {b.avgCTOR != null ? `${(b.avgCTOR * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
