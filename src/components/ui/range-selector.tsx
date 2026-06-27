"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { DayDatePicker } from "@/components/schedule/schedule-views";

interface Props {
  month: number;   // 0-indexed, used in month mode
  year: number;
  isMTD: boolean;
  brand?: string;
  // custom range (YYYY-MM-DD), present when in custom mode
  startDate?: string;
  endDate?: string;
}

export function RangeSelector({ month, year, isMTD, brand, startDate, endDate }: Props) {
  const router = useRouter();
  const isCustom = !!(startDate && endDate);
  const [mode, setMode] = useState<"month" | "custom">(isCustom ? "custom" : "month");
  const [localStart, setLocalStart] = useState(startDate ?? format(new Date(year, month, 1), "yyyy-MM-dd"));
  const [localEnd,   setLocalEnd]   = useState(endDate ?? format(new Date(year, month + 1, 0), "yyyy-MM-dd"));

  function buildMonthUrl(m: number, y: number) {
    const params = new URLSearchParams({ month: String(m), year: String(y) });
    if (brand) params.set("brand", brand);
    return `/?${params.toString()}`;
  }

  function goMonth(offsetMonths: number) {
    const d = new Date(year, month + offsetMonths, 1);
    router.push(buildMonthUrl(d.getMonth(), d.getFullYear()));
  }

  function onMonthSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const [m, y] = e.target.value.split("-").map(Number);
    router.push(buildMonthUrl(m, y));
  }

  function applyCustomRange() {
    if (!localStart || !localEnd || localStart > localEnd) return;
    const params = new URLSearchParams({ start: localStart, end: localEnd });
    if (brand) params.set("brand", brand);
    router.push(`/?${params.toString()}`);
  }

  function switchToMonth() {
    setMode("month");
    router.push(buildMonthUrl(month, year));
  }

  // Build last 24 months as options
  const now = new Date();
  const options: { month: number; year: number; label: string }[] = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({ month: d.getMonth(), year: d.getFullYear(), label: format(d, "MMMM yyyy") });
  }
  const isCurrentMonth = month === now.getMonth() && year === now.getFullYear();
  const oldest = options[options.length - 1];
  const canGoBack    = !(month === oldest.month && year === oldest.year);
  const canGoForward = !isCurrentMonth;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Mode toggle */}
      <div className="flex rounded-md overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <button
          onClick={() => { setMode("month"); if (isCustom) switchToMonth(); }}
          className="px-2.5 py-1 text-xs font-semibold transition-colors"
          style={mode === "month"
            ? { background: "var(--accent)", color: "#fff" }
            : { background: "var(--bg-subtle)", color: "var(--text-muted)" }}
        >
          Month
        </button>
        <button
          onClick={() => setMode("custom")}
          className="px-2.5 py-1 text-xs font-semibold flex items-center gap-1 transition-colors"
          style={mode === "custom"
            ? { background: "var(--accent)", color: "#fff" }
            : { background: "var(--bg-subtle)", color: "var(--text-muted)" }}
        >
          <CalendarDays size={11} /> Custom
        </button>
      </div>

      {mode === "month" && (
        <>
          <button
            onClick={() => goMonth(-1)}
            disabled={!canGoBack}
            className="p-1 rounded-md transition-colors disabled:opacity-30"
            style={{ color: "var(--text-secondary)", background: "var(--bg-subtle)", border: "1px solid var(--border)" }}
          >
            <ChevronLeft size={14} />
          </button>
          <select
            value={`${month}-${year}`}
            onChange={onMonthSelect}
            className="text-sm font-semibold px-2 py-1 rounded-md outline-none cursor-pointer"
            style={{ background: "var(--bg-subtle)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          >
            {options.map(o => (
              <option key={`${o.month}-${o.year}`} value={`${o.month}-${o.year}`}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => goMonth(1)}
            disabled={!canGoForward}
            className="p-1 rounded-md transition-colors disabled:opacity-30"
            style={{ color: "var(--text-secondary)", background: "var(--bg-subtle)", border: "1px solid var(--border)" }}
          >
            <ChevronRight size={14} />
          </button>
          {isMTD && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(99,102,241,0.12)", color: "var(--accent)", border: "1px solid rgba(99,102,241,0.25)" }}>
              MTD
            </span>
          )}
        </>
      )}

      {mode === "custom" && (
        <div className="flex items-center gap-1.5">
          <DayDatePicker gridDate={localStart} setGridDate={setLocalStart} />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>to</span>
          <DayDatePicker gridDate={localEnd} setGridDate={setLocalEnd} />
          <button
            onClick={applyCustomRange}
            disabled={!localStart || !localEnd || localStart > localEnd}
            className="px-3 py-1 rounded-md text-xs font-semibold disabled:opacity-40 transition-colors"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
