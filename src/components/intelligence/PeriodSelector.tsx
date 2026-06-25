"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  endOfMonth, endOfQuarter, endOfYear, format,
  startOfMonth, startOfQuarter, startOfYear,
  subDays, subMonths,
} from "date-fns";

export interface RangeChoice {
  key: string;
  label: string;
  from: Date;
  to: Date;
}

function preset(key: string, label: string, from: Date, to: Date): RangeChoice {
  return { key, label, from, to };
}

function mytDay(dateStr: string, end = false): Date {
  return new Date(`${dateStr}T${end ? "23:59:59" : "00:00:00"}+08:00`);
}

function buildPresets(): RangeChoice[] {
  const myt = new Date(Date.now() + 8 * 3_600_000);
  const todayStr = myt.toISOString().slice(0, 10);
  const lastMonthAnchor = subMonths(myt, 1);
  return [
    preset("last7",      "Last 7 days",   mytDay(format(subDays(myt, 6),  "yyyy-MM-dd")), mytDay(todayStr, true)),
    preset("last30",     "Last 30 days",  mytDay(format(subDays(myt, 29), "yyyy-MM-dd")), mytDay(todayStr, true)),
    preset("last90",     "Last 90 days",  mytDay(format(subDays(myt, 89), "yyyy-MM-dd")), mytDay(todayStr, true)),
    preset("thisMonth",  "This month",    mytDay(format(startOfMonth(myt), "yyyy-MM-dd")), mytDay(todayStr, true)),
    preset("lastMonth",  "Last month",    mytDay(format(startOfMonth(lastMonthAnchor), "yyyy-MM-dd")), mytDay(format(endOfMonth(lastMonthAnchor), "yyyy-MM-dd"), true)),
    preset("thisQuarter","This quarter",  mytDay(format(startOfQuarter(myt), "yyyy-MM-dd")), mytDay(todayStr, true)),
    preset("thisYear",   "This year",     mytDay(format(startOfYear(myt), "yyyy-MM-dd")),  mytDay(format(endOfYear(myt), "yyyy-MM-dd"), true)),
  ];
}

interface IntelligencePeriodSelectorProps {
  value: RangeChoice;
  onChange: (next: RangeChoice) => void;
}

export function IntelligencePeriodSelector({
  value,
  onChange,
}: IntelligencePeriodSelectorProps) {
  const [open, setOpen] = useState(false);
  const presets = buildPresets();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12.5px] font-medium cursor-pointer transition-colors"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
      >
        <span>{value.label}</span>
        <span style={{ color: "var(--text-muted)" }}>
          · {format(value.from, "d MMM")} – {format(value.to, "d MMM yyyy")}
        </span>
        <ChevronDown size={13} style={{ color: "var(--text-muted)" }} />
      </button>
      {open && (
        <div
          className="absolute top-full mt-1 left-0 z-30 rounded-lg overflow-hidden min-w-[200px]"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {presets.map((p) => (
            <button
              key={p.key}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(p);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-[12.5px] transition-colors cursor-pointer"
              style={{
                background:
                  p.key === value.key ? "var(--bg-hover)" : "transparent",
                color:
                  p.key === value.key
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                fontWeight: p.key === value.key ? 600 : 400,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (p.key !== value.key) {
                  (e.currentTarget as HTMLElement).style.background =
                    "transparent";
                }
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
