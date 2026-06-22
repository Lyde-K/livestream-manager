"use client";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { formatCompactCurrency, formatHours, formatPct } from "./format";

export interface HostLeaderboardEntry {
  liveHostId: string;
  displayName: string;
  type: string;
  totalSessions: number;
  totalHours: number;
  totalGmv: number;
  bau: { sessions: number; hours: number; gmv: number; gmvPerHour: number | null };
  campaign: { sessions: number; hours: number; gmv: number; gmvPerHour: number | null };
  ctorMedian: number | null;
  gmvPerHourMedian: number | null;
  ctorVsBenchmark: number | null;
  gmvPerHourVsBenchmark: number | null;
  exceptionalCount: number;
  underperformingCount: number;
}

interface HostLeaderboardTableProps {
  hosts: HostLeaderboardEntry[];
}

export function HostLeaderboardTable({ hosts }: HostLeaderboardTableProps) {
  if (hosts.length === 0) {
    return (
      <div
        className="rounded-xl px-4 py-8 text-center text-sm"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          color: "var(--text-muted)",
        }}
      >
        No host data in this period.
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
              <Th align="left" rowSpan={2}>Host</Th>
              <Th align="center" colSpan={2} accent>BAU</Th>
              <Th align="center" colSpan={2} accent>Campaign</Th>
              <Th align="right" rowSpan={2}>GMV / hr<br/><Sub>vs median</Sub></Th>
              <Th align="right" rowSpan={2}>CTOR<br/><Sub>vs median</Sub></Th>
              <Th align="left" rowSpan={2}>Tier mix</Th>
            </tr>
            <tr style={{ background: "var(--bg-subtle)" }}>
              <Th align="right" sub>Sessions / hours</Th>
              <Th align="right" sub>GMV</Th>
              <Th align="right" sub>Sessions / hours</Th>
              <Th align="right" sub>GMV</Th>
            </tr>
          </thead>
          <tbody>
            {hosts.map((h) => (
              <tr
                key={h.liveHostId}
                style={{ borderTop: "1px solid var(--border)" }}
              >
                <Td>
                  <div
                    className="font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {h.displayName}
                  </div>
                  <div style={{ color: "var(--text-muted)" }}>
                    {h.totalSessions} sessions · {formatHours(h.totalHours)}
                  </div>
                </Td>
                <Td align="right" mono>
                  {h.bau.sessions === 0 ? (
                    <span style={{ color: "var(--text-muted)" }}>—</span>
                  ) : (
                    <>
                      <span style={{ color: "var(--text-primary)" }}>
                        {h.bau.sessions}
                      </span>
                      <span style={{ color: "var(--text-muted)" }}>
                        {" · "}
                        {formatHours(h.bau.hours)}
                      </span>
                    </>
                  )}
                </Td>
                <Td align="right" mono>
                  {h.bau.sessions === 0 ? (
                    <span style={{ color: "var(--text-muted)" }}>—</span>
                  ) : (
                    <span
                      className="font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {formatCompactCurrency(h.bau.gmv)}
                    </span>
                  )}
                </Td>
                <Td align="right" mono>
                  {h.campaign.sessions === 0 ? (
                    <span style={{ color: "var(--text-muted)" }}>—</span>
                  ) : (
                    <>
                      <span style={{ color: "var(--text-primary)" }}>
                        {h.campaign.sessions}
                      </span>
                      <span style={{ color: "var(--text-muted)" }}>
                        {" · "}
                        {formatHours(h.campaign.hours)}
                      </span>
                    </>
                  )}
                </Td>
                <Td align="right" mono>
                  {h.campaign.sessions === 0 ? (
                    <span style={{ color: "var(--text-muted)" }}>—</span>
                  ) : (
                    <span
                      className="font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {formatCompactCurrency(h.campaign.gmv)}
                    </span>
                  )}
                </Td>
                <Td align="right" mono>
                  <div style={{ color: "var(--text-primary)" }}>
                    {h.gmvPerHourMedian !== null
                      ? formatCompactCurrency(h.gmvPerHourMedian)
                      : "—"}
                  </div>
                  <DeltaCurrency value={h.gmvPerHourVsBenchmark} />
                </Td>
                <Td align="right" mono>
                  <div style={{ color: "var(--text-primary)" }}>
                    {formatPct(h.ctorMedian)}
                  </div>
                  <DeltaPct value={h.ctorVsBenchmark} />
                </Td>
                <Td>
                  <TierMixChips
                    exceptional={h.exceptionalCount}
                    underperforming={h.underperformingCount}
                    average={
                      h.totalSessions -
                      h.exceptionalCount -
                      h.underperformingCount
                    }
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  align = "left",
  sub,
  accent,
  rowSpan,
  colSpan,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  sub?: boolean;
  accent?: boolean;
  rowSpan?: number;
  colSpan?: number;
}) {
  return (
    <th
      rowSpan={rowSpan}
      colSpan={colSpan}
      className={`font-semibold px-3 py-2 whitespace-nowrap text-${align} ${
        sub ? "text-[10px] uppercase tracking-wider" : ""
      }`}
      style={{
        color: accent ? "var(--accent-text)" : "var(--text-secondary)",
        background: accent ? "var(--accent-light)" : undefined,
        verticalAlign: "bottom",
      }}
    >
      {children}
    </th>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[10px] font-normal uppercase tracking-wider"
      style={{ color: "var(--text-muted)" }}
    >
      {children}
    </span>
  );
}

function Td({
  children,
  align = "left",
  mono,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
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

function DeltaPct({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        <Minus size={10} />—
      </span>
    );
  }
  if (Math.abs(value) < 0.0005) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        <Minus size={10} />flat
      </span>
    );
  }
  const positive = value > 0;
  const Icon = positive ? ArrowUp : ArrowDown;
  const color = positive ? "var(--success-text)" : "var(--danger-text)";
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px]"
      style={{ color }}
    >
      <Icon size={10} />
      {(Math.abs(value) * 100).toFixed(2)}pp
    </span>
  );
}

function DeltaCurrency({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        <Minus size={10} />—
      </span>
    );
  }
  if (Math.abs(value) < 1) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        <Minus size={10} />flat
      </span>
    );
  }
  const positive = value > 0;
  const Icon = positive ? ArrowUp : ArrowDown;
  const color = positive ? "var(--success-text)" : "var(--danger-text)";
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px]"
      style={{ color }}
    >
      <Icon size={10} />
      {formatCompactCurrency(Math.abs(value))}
    </span>
  );
}

function TierMixChips({
  exceptional,
  underperforming,
  average,
}: {
  exceptional: number;
  underperforming: number;
  average: number;
}) {
  return (
    <div className="flex gap-1 flex-wrap">
      {exceptional > 0 && (
        <Chip bg="var(--success-light)" color="var(--success-text)">
          ↑{exceptional} top
        </Chip>
      )}
      {average > 0 && (
        <Chip bg="var(--bg-subtle)" color="var(--text-secondary)">
          {average} avg
        </Chip>
      )}
      {underperforming > 0 && (
        <Chip bg="var(--danger-light)" color="var(--danger-text)">
          ↓{underperforming} low
        </Chip>
      )}
    </div>
  );
}

function Chip({
  children,
  bg,
  color,
}: {
  children: React.ReactNode;
  bg: string;
  color: string;
}) {
  return (
    <span
      className="text-[10px] font-medium px-1.5 py-0.5 rounded"
      style={{ background: bg, color }}
    >
      {children}
    </span>
  );
}
