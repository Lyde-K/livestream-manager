"use client";
import { TrendingDown, TrendingUp } from "lucide-react";
import { formatCompactCurrency, formatHours, formatPct } from "./format";

export interface BrandInsightRow {
  brandId: string;
  name: string;
  color: string;
  totalSessions: number;
  totalHours: number;
  totalGmv: number;
  gmvPerHour: number;
  avgViewers: number;
  ctorMedian: number | null;
  bau: { sessions: number; hours: number; gmv: number };
  campaign: { sessions: number; hours: number; gmv: number };
  topHostName: string | null;
  topHostGmv: number;
  bestSessionId: string | null;
  worstSessionId: string | null;
  exceptionalCount: number;
  underperformingCount: number;
}

interface BrandInsightsPanelProps {
  brands: BrandInsightRow[];
  onSelectSession: (sessionId: string) => void;
}

export function BrandInsightsPanel({
  brands,
  onSelectSession,
}: BrandInsightsPanelProps) {
  if (brands.length === 0) {
    return (
      <div
        className="rounded-xl px-4 py-8 text-center text-sm"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          color: "var(--text-muted)",
        }}
      >
        No brand data in this period.
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ background: "var(--bg-subtle)" }}>
              <Th align="left">Brand</Th>
              <Th align="right">Sessions / hours</Th>
              <Th align="right">GMV</Th>
              <Th align="right">GMV / hr</Th>
              <Th align="right">CTOR (median)</Th>
              <Th align="left">BAU vs Campaign GMV</Th>
              <Th align="left">Top host</Th>
              <Th align="left">Sessions</Th>
            </tr>
          </thead>
          <tbody>
            {brands.map((b) => {
              const total = b.bau.gmv + b.campaign.gmv || 1;
              const bauPct = (b.bau.gmv / total) * 100;
              return (
                <tr
                  key={b.brandId}
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <Td>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: b.color }}
                      />
                      <span
                        className="font-semibold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {b.name}
                      </span>
                    </div>
                  </Td>
                  <Td align="right">
                    <span style={{ color: "var(--text-primary)" }}>
                      {b.totalSessions}
                    </span>
                    <span style={{ color: "var(--text-muted)" }}>
                      {" · "}
                      {formatHours(b.totalHours)}
                    </span>
                  </Td>
                  <Td align="right" mono>
                    <span
                      className="font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {formatCompactCurrency(b.totalGmv)}
                    </span>
                  </Td>
                  <Td align="right" mono>
                    {formatCompactCurrency(b.gmvPerHour)}
                  </Td>
                  <Td align="right" mono>
                    {formatPct(b.ctorMedian)}
                  </Td>
                  <Td>
                    <BauCampaignBar
                      bauPct={bauPct}
                      bauGmv={b.bau.gmv}
                      campaignGmv={b.campaign.gmv}
                    />
                  </Td>
                  <Td>
                    {b.topHostName ? (
                      <div className="flex flex-col">
                        <span
                          className="font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {b.topHostName}
                        </span>
                        <span style={{ color: "var(--text-muted)" }}>
                          {formatCompactCurrency(b.topHostGmv)}
                        </span>
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </Td>
                  <Td>
                    <div className="flex gap-1.5 flex-wrap">
                      {b.bestSessionId && (
                        <button
                          onClick={() => onSelectSession(b.bestSessionId!)}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded transition-colors cursor-pointer hover:opacity-80"
                          style={{
                            background: "var(--success-light)",
                            color: "var(--success-text)",
                          }}
                          title="View best session"
                        >
                          <TrendingUp size={10} />
                          Best
                        </button>
                      )}
                      {b.worstSessionId &&
                        b.worstSessionId !== b.bestSessionId && (
                          <button
                            onClick={() => onSelectSession(b.worstSessionId!)}
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded transition-colors cursor-pointer hover:opacity-80"
                            style={{
                              background: "var(--danger-light)",
                              color: "var(--danger-text)",
                            }}
                            title="View worst session"
                          >
                            <TrendingDown size={10} />
                            Worst
                          </button>
                        )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`font-semibold px-3 py-2.5 whitespace-nowrap text-${align}`}
      style={{ color: "var(--text-secondary)" }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  mono,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  mono?: boolean;
}) {
  return (
    <td
      className={`px-3 py-3 align-top whitespace-nowrap text-${align} ${
        mono ? "tabular-nums" : ""
      }`}
      style={{ color: "var(--text-secondary)" }}
    >
      {children}
    </td>
  );
}

function BauCampaignBar({
  bauPct,
  bauGmv,
  campaignGmv,
}: {
  bauPct: number;
  bauGmv: number;
  campaignGmv: number;
}) {
  const campPct = 100 - bauPct;
  return (
    <div className="flex flex-col gap-1 min-w-[140px]">
      <div
        className="flex h-2 rounded-full overflow-hidden"
        style={{ background: "var(--bg-subtle)" }}
      >
        <div
          style={{
            width: `${bauPct}%`,
            background: "var(--accent)",
          }}
        />
        <div
          style={{
            width: `${campPct}%`,
            background: "var(--success)",
          }}
        />
      </div>
      <div
        className="flex justify-between text-[10px] tabular-nums"
        style={{ color: "var(--text-muted)" }}
      >
        <span>BAU {formatCompactCurrency(bauGmv)}</span>
        <span>Camp {formatCompactCurrency(campaignGmv)}</span>
      </div>
    </div>
  );
}
