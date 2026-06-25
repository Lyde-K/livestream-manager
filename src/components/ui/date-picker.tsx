"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import {
  format, parseISO, addMonths, subMonths,
  startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, isSameDay, isToday, isBefore, isAfter, startOfDay,
} from "date-fns";

interface DatePickerProps {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  highlightDates?: { date: string; color?: string }[];
}

function toLocal(dateStr: string): Date {
  return parseISO(dateStr + "T00:00:00");
}

function useTheme() {
  const [theme, setTheme] = useState("dark");
  useEffect(() => {
    const update = () => setTheme(document.documentElement.getAttribute("data-theme") ?? "dark");
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

export function DatePicker({
  value, onChange, min, max, placeholder = "Select date",
  className = "", style, disabled, highlightDates = [],
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(value ? toLocal(value) : new Date());
  const theme = useTheme();
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
  const firstDow = (getDay(startOfMonth(view)) + 6) % 7;
  const selected = value ? toLocal(value) : null;
  const highlightMap = new Map(highlightDates.map(h => [h.date, h.color ?? "#ef4444"]));

  const isDark = theme !== "light";
  const dropBg   = isDark ? "rgba(13,27,48,0.98)"  : "#ffffff";
  const navBg    = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const navColor = isDark ? "#94a3b8" : "#475569";
  const headerColor = isDark ? "#f8fafc" : "#07111f";
  const mutedColor  = isDark ? "#64748b" : "#94a3b8";
  const dayColor    = isDark ? "#f8fafc" : "#07111f";
  const dayDisabled = isDark ? "#334155" : "#cbd5e1";
  const hoverBg     = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const todayBorder = "1.5px solid #1677ff";

  function select(d: Date) {
    if (isDisabled(d)) return;
    onChange(format(d, "yyyy-MM-dd"));
    setOpen(false);
  }

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
          border: "1px solid var(--border)",
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

      {/* Dropdown */}
      {open && (
        <div
          data-theme={theme}
          className="absolute z-50 mt-2 left-0"
          style={{
            background: dropBg,
            borderRadius: 20,
            boxShadow: isDark
              ? "0 20px 60px rgba(0,0,0,0.5)"
              : "0 8px 40px rgba(0,0,0,0.12)",
            width: 320,
            padding: "20px 20px 16px",
            border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.06)",
          }}
        >
          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => setView(v => subMonths(v, 1))}
              style={{
                width: 36, height: 36, borderRadius: "50%",
                background: navBg, border: "none",
                color: navColor, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: 16, fontWeight: 700, color: headerColor, letterSpacing: "-0.01em" }}>
              {format(view, "MMMM yyyy")}
            </span>
            <button
              type="button"
              onClick={() => setView(v => addMonths(v, 1))}
              style={{
                width: 36, height: 36, borderRadius: "50%",
                background: navBg, border: "none",
                color: navColor, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 }}>
            {["Mo","Tu","We","Th","Fr","Sa","Su"].map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: mutedColor, padding: "4px 0" }}>{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px 0" }}>
            {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
            {days.map(d => {
              const dateStr = format(d, "yyyy-MM-dd");
              const isSel   = selected ? isSameDay(d, selected) : false;
              const isTod   = isToday(d);
              const dis     = isDisabled(d);
              const hl      = highlightMap.get(dateStr);

              return (
                <button
                  key={dateStr}
                  type="button"
                  disabled={dis}
                  onClick={() => select(d)}
                  style={{
                    height: 38, width: "100%",
                    borderRadius: "50%",
                    border: isTod && !isSel ? todayBorder : "none",
                    background: isSel ? "#1677ff" : "transparent",
                    color: isSel ? "#fff" : dis ? dayDisabled : hl ? hl : dayColor,
                    fontSize: 14,
                    fontWeight: isSel || isTod ? 700 : 400,
                    cursor: dis ? "not-allowed" : "pointer",
                    opacity: dis ? 0.35 : 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    position: "relative",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={e => {
                    if (!dis && !isSel) (e.currentTarget as HTMLElement).style.background = hoverBg;
                  }}
                  onMouseLeave={e => {
                    if (!isSel) (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  {d.getDate()}
                  {hl && !isSel && (
                    <span style={{
                      position: "absolute", bottom: 4, left: "50%",
                      transform: "translateX(-50%)",
                      width: 4, height: 4, borderRadius: "50%", background: hl,
                    }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
