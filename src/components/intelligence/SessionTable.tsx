"use client";
import { ChevronRight } from "lucide-react";
import {
  formatCompactCurrency,
  formatHours,
  formatPct,
  tierColor,
} from "./format";

interface SessionRow {
  sessionId: string;
  tier: string;
  gmv: number;
  gmvPerHour: number | null;
  durationHours: number | null;
  viewers: number | null;
  ctor: number | null;
  isCampaignDay: boolean;
  brand?: { name: string; color: string } | null;
  host?: { displayName: string } | null;
  platform: "TIKTOK" | "SHOPEE";
}

interface SessionTableProps {
  title: string;
  rows: SessionRow[];
  onSelect: (sessionId: string) => void;
  emptyText?: string;
}

export function SessionTable({
  title,
  rows,
  onSelect,
  emptyText = "No sessions in this period.",
}: SessionTableProps) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        className="px-4 py-3 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <h3
          className="text-[13px] font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h3>
      </div>
      {rows.length === 0 ? (
        <div
          className="px-4 py-8 text-center text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          {emptyText}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ background: "var(--bg-subtle)" }}>
                <th className="text-left font-semibold px-4 py-2.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                  Session
                </th>
                <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                  Host
                </th>
                <th className="text-right font-semibold px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                  Hours
                </th>
                <th className="text-right font-semibold px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                  GMV
                </th>
                <th className="text-right font-semibold px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                  GMV / hr
                </th>
                <th className="text-right font-semibold px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                  Viewers
                </th>
                <th className="text-right font-semibold px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                  CTOR
                </th>
                <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                  Tier
                </th>
                <th aria-hidden className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tc = tierColor(r.tier);
                return (
                  <tr
                    key={r.sessionId}
                    onClick={() => onSelect(r.sessionId)}
                    className="cursor-pointer transition-colors hover:[background:var(--bg-hover)]"
                    style={{ borderTop: "1px solid var(--border)" }}
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-2 flex-wrap">
                        {r.brand && (
                          <span
                            className="inline-flex items-center gap-1.5 font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: r.brand.color }}
                            />
                            {r.brand.name}
                          </span>
                        )}
                        <span
                          className="text-[10px] uppercase font-medium"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {r.platform}
                        </span>
                        {r.isCampaignDay && (
                          <span
                            className="text-[10px] uppercase font-semibold rounded px-1.5 py-0.5"
                            style={{
                              background: "var(--accent-light)",
                              color: "var(--accent-text)",
                            }}
                          >
                            Campaign
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      className="px-3 py-3 align-top whitespace-nowrap"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {r.host?.displayName ?? "—"}
                    </td>
                    <td
                      className="px-3 py-3 align-top text-right tabular-nums"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {formatHours(r.durationHours)}
                    </td>
                    <td
                      className="px-3 py-3 align-top text-right tabular-nums font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {formatCompactCurrency(r.gmv)}
                    </td>
                    <td
                      className="px-3 py-3 align-top text-right tabular-nums"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {r.gmvPerHour !== null
                        ? formatCompactCurrency(r.gmvPerHour)
                        : "—"}
                    </td>
                    <td
                      className="px-3 py-3 align-top text-right tabular-nums"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {r.viewers !== null ? r.viewers.toLocaleString() : "—"}
                    </td>
                    <td
                      className="px-3 py-3 align-top text-right tabular-nums"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {formatPct(r.ctor)}
                    </td>
                    <td className="px-3 py-3 align-top whitespace-nowrap">
                      <span
                        className="inline-flex items-center text-[10px] uppercase font-semibold rounded-full px-2 py-0.5"
                        style={{ background: tc.bg, color: tc.text }}
                      >
                        {tc.label}
                      </span>
                    </td>
                    <td className="px-2 py-3 align-top">
                      <ChevronRight
                        size={14}
                        style={{ color: "var(--text-muted)" }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
