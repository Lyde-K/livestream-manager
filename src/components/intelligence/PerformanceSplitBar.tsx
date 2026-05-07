"use client";
import { tierColor } from "./format";

interface SplitItem {
  tier: string;
  count: number;
  pct: number;
}

const TIER_COLORS: Record<string, string> = {
  EXCEPTIONAL: "#10b981",
  GOOD: "#6366f1",
  AVERAGE: "#94a3b8",
  MIXED: "#f59e0b",
  UNDERPERFORMING: "#ef4444",
};

export function PerformanceSplitBar({ split }: { split: SplitItem[] }) {
  const filtered = split.filter((s) => s.count > 0);
  const total = filtered.reduce((s, t) => s + t.count, 0);

  if (total === 0) {
    return (
      <div className="text-sm" style={{ color: "var(--text-muted)" }}>
        No completed sessions in this period.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className="flex h-3 rounded-full overflow-hidden"
        style={{ background: "var(--bg-subtle)" }}
      >
        {filtered.map((item) => (
          <div
            key={item.tier}
            style={{
              width: `${item.pct * 100}%`,
              background: TIER_COLORS[item.tier] ?? "#94a3b8",
            }}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {split.map((item) => {
          const tc = tierColor(item.tier);
          return (
            <div
              key={item.tier}
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border)",
              }}
            >
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: TIER_COLORS[item.tier] ?? "#94a3b8" }}
              />
              <div className="flex-1 min-w-0">
                <div
                  className="text-[11px] font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {tc.label}
                </div>
                <div
                  className="text-[13px] font-semibold tabular-nums"
                  style={{ color: "var(--text-primary)" }}
                >
                  {item.count}{" "}
                  <span
                    className="text-[10px] font-normal"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {(item.pct * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
