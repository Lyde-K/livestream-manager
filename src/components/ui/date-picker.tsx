"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { format, parseISO, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isToday, isBefore, isAfter, startOfDay } from "date-fns";

interface DatePickerProps {
  value: string;           // "YYYY-MM-DD" or ""
  onChange: (v: string) => void;
  min?: string;            // "YYYY-MM-DD"
  max?: string;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  highlightDates?: { date: string; color?: string }[];  // dates to highlight
}

function toLocal(dateStr: string): Date {
  return parseISO(dateStr + "T00:00:00");
}

export function DatePicker({
  value, onChange, min, max, placeholder = "Select date", className = "", style, disabled, highlightDates = []
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(value ? toLocal(value) : new Date());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (value) setView(toLocal(value));
  }, [value]);

  const minDate = min ? startOfDay(toLocal(min)) : null;
  const maxDate = max ? startOfDay(toLocal(max)) : null;

  const isDisabled = useCallback((d: Date) => {
    const day = startOfDay(d);
    if (minDate && isBefore(day, minDate)) return true;
    if (maxDate && isAfter(day, maxDate)) return true;
    return false;
  }, [minDate, maxDate]);

  const days = eachDayOfInterval({ start: startOfMonth(view), end: endOfMonth(view) });
  // Day of week for first day (0=Sun → Mon-indexed: shift)
  const firstDow = (getDay(startOfMonth(view)) + 6) % 7; // Mon=0

  const selected = value ? toLocal(value) : null;

  function select(d: Date) {
    if (isDisabled(d)) return;
    onChange(format(d, "yyyy-MM-dd"));
    setOpen(false);
  }

  const highlightMap = new Map(highlightDates.map(h => [h.date, h.color ?? "#ef4444"]));

  return (
    <div ref={ref} className={`relative ${className}`} style={style}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 text-sm text-left"
        style={{
          height: 34,
          background: "var(--bg-card)",
          border: `1px solid var(--border)`,
          borderRadius: "var(--radius-sm)",
          color: value ? "var(--text-primary)" : "var(--text-muted)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Calendar size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <span className="flex-1 truncate">
          {value ? format(toLocal(value), "d MMM yyyy") : placeholder}
        </span>
      </button>

      {/* Dropdown calendar */}
      {open && (
        <div
          className="absolute z-50 mt-1.5 left-0"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-lg)",
            width: 280,
            padding: "12px",
          }}
        >
          {/* Month nav */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setView(v => subMonths(v, 1))}
              className="flex items-center justify-center rounded-lg"
              style={{ width: 28, height: 28, background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-secondary)", cursor: "pointer" }}
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {format(view, "MMMM yyyy")}
            </span>
            <button
              type="button"
              onClick={() => setView(v => addMonths(v, 1))}
              className="flex items-center justify-center rounded-lg"
              style={{ width: 28, height: 28, background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-secondary)", cursor: "pointer" }}
            >
              <ChevronRight size={13} />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1">
            {["Mo","Tu","We","Th","Fr","Sa","Su"].map(d => (
              <div key={d} className="text-center text-[11px] font-medium py-1"
                style={{ color: "var(--text-muted)" }}>{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {/* Leading empty cells */}
            {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}

            {days.map(d => {
              const dateStr = format(d, "yyyy-MM-dd");
              const isSelected = selected && isSameDay(d, selected);
              const isTodayDate = isToday(d);
              const dis = isDisabled(d);
              const highlight = highlightMap.get(dateStr);

              return (
                <button
                  key={dateStr}
                  type="button"
                  disabled={dis}
                  onClick={() => select(d)}
                  className="flex items-center justify-center text-[13px] rounded-lg relative"
                  style={{
                    height: 32,
                    fontWeight: isSelected ? 700 : 400,
                    background: isSelected
                      ? "var(--accent)"
                      : isTodayDate
                        ? "var(--accent-light)"
                        : "transparent",
                    color: isSelected
                      ? "#fff"
                      : dis
                        ? "var(--text-muted)"
                        : highlight
                          ? highlight
                          : "var(--text-primary)",
                    cursor: dis ? "not-allowed" : "pointer",
                    opacity: dis ? 0.4 : 1,
                    border: isTodayDate && !isSelected ? "1px solid var(--accent)" : "1px solid transparent",
                    outline: "none",
                  }}
                  onMouseEnter={e => {
                    if (!dis && !isSelected) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = isTodayDate ? "var(--accent-light)" : "transparent";
                  }}
                >
                  {d.getDate()}
                  {highlight && !isSelected && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" style={{ background: highlight }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex justify-between mt-3 pt-2.5" style={{ borderTop: "1px solid var(--border)" }}>
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className="text-xs px-2 py-1 rounded-lg"
              style={{ color: "var(--text-muted)", cursor: "pointer" }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                if (!isDisabled(today)) { select(today); }
                else setView(today);
              }}
              className="text-xs px-2 py-1 rounded-lg"
              style={{ color: "var(--accent)", cursor: "pointer" }}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
