"use client";
import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

interface Props {
  from: string;       // "YYYY-MM"
  to: string;         // "YYYY-MM"
  minPeriod: string;  // "YYYY-MM"
  maxPeriod: string;  // "YYYY-MM"
  isActive?: boolean; // whether "Custom range" mode is active
  onActivate?: () => void; // called when user clicks the trigger button
  onChange: (from: string, to: string) => void;
}

function parseYM(ym: string): { year: number; month: number } {
  const [y, m] = ym.split("-").map(Number);
  return { year: y, month: m };
}

function toYM(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function MonthRangePicker({ from, to, minPeriod, maxPeriod, isActive, onActivate, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null); // first click anchor
  const [leftYear, setLeftYear] = useState<number>(() => {
    if (from) return parseYM(from).year;
    if (maxPeriod) return parseYM(maxPeriod).year;
    return new Date().getFullYear();
  });
  const ref = useRef<HTMLDivElement>(null);

  const rightYear = leftYear + 1;

  useEffect(() => {
    function onClickOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSelecting(null);
      }
    }
    document.addEventListener("mousedown", onClickOut);
    return () => document.removeEventListener("mousedown", onClickOut);
  }, []);

  function handleMonthClick(ym: string) {
    if (cmp(ym, minPeriod) < 0 || cmp(ym, maxPeriod) > 0) return;

    if (!selecting) {
      setSelecting(ym);
    } else {
      const [a, b] = cmp(selecting, ym) <= 0 ? [selecting, ym] : [ym, selecting];
      onChange(a, b);
      setSelecting(null);
      setOpen(false);
    }
  }

  function isInRange(ym: string): boolean {
    if (!from || !to) return false;
    return cmp(ym, from) >= 0 && cmp(ym, to) <= 0;
  }

  function isStart(ym: string) { return ym === from; }
  function isEnd(ym: string) { return ym === to; }

  function isPreviewRange(ym: string): boolean {
    if (!selecting || !hovered) return false;
    const [a, b] = cmp(selecting, hovered) <= 0 ? [selecting, hovered] : [hovered, selecting];
    return cmp(ym, a) >= 0 && cmp(ym, b) <= 0;
  }

  function isDisabled(ym: string): boolean {
    return cmp(ym, minPeriod) < 0 || cmp(ym, maxPeriod) > 0;
  }

  function renderYear(year: number) {
    return (
      <div key={year}>
        <div className="text-center text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>{year}</div>
        <div className="grid grid-cols-3 gap-1.5">
          {MONTHS.map((label, i) => {
            const ym = toYM(year, i + 1);
            const disabled = isDisabled(ym);
            const inRange = selecting ? isPreviewRange(ym) : isInRange(ym);
            const isS = isStart(ym) || ym === selecting;
            const isE = isEnd(ym);
            const isAnchor = ym === selecting;

            let bg = "transparent";
            let color = disabled ? "var(--text-muted)" : "var(--text-secondary)";
            let fontWeight = "normal";
            let border = "1px solid transparent";

            if ((isS || isE || isAnchor) && !disabled) {
              bg = "var(--accent)";
              color = "#fff";
              fontWeight = "600";
            } else if (inRange && !disabled) {
              bg = "color-mix(in oklab, var(--accent) 18%, transparent)";
              color = "var(--accent)";
            }
            if (hovered === ym && !disabled && !isS && !isE && !isAnchor) {
              border = "1px solid var(--accent)";
            }

            return (
              <button
                key={ym}
                disabled={disabled}
                onMouseEnter={() => setHovered(ym)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => handleMonthClick(ym)}
                className="rounded-lg py-2 text-xs font-medium transition-all"
                style={{ background: bg, color, fontWeight, border, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1 }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const label = from && to
    ? `${from} → ${to}`
    : selecting
    ? `${selecting} → …`
    : "Custom range";

  const active = isActive ?? (from !== "" || to !== "");

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          if (!isActive) onActivate?.();
          setOpen((o) => !o);
          setSelecting(null);
        }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
        style={{
          background: active ? "var(--accent)" : "var(--bg-subtle)",
          color: active ? "#fff" : "var(--text-secondary)",
        }}
      >
        <Calendar size={12} />
        {label}
      </button>

      {open && (
        <div
          className="absolute mt-2 p-4 rounded-xl shadow-2xl border"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border)",
            minWidth: 420,
            left: 0,
            zIndex: 9999,
          }}
        >
          {/* Year navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setLeftYear((y) => y - 1)}
              className="p-1 rounded-md hover:bg-[var(--bg-subtle)] transition-colors"
              style={{ color: "var(--text-secondary)" }}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              {selecting ? "Now select end month" : "Select start month"}
            </span>
            <button
              onClick={() => setLeftYear((y) => y + 1)}
              className="p-1 rounded-md hover:bg-[var(--bg-subtle)] transition-colors"
              style={{ color: "var(--text-secondary)" }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Two-year grid */}
          <div className="grid grid-cols-2 gap-6">
            {renderYear(leftYear)}
            {renderYear(rightYear)}
          </div>

          {/* Footer */}
          {from && to && (
            <div className="mt-4 pt-3 border-t flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {from} → {to}
              </span>
              <button
                onClick={() => { onChange("", ""); setOpen(false); }}
                className="text-xs px-2 py-1 rounded"
                style={{ color: "var(--text-muted)" }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
