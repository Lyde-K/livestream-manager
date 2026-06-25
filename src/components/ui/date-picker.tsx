"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
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

export function useTheme() {
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

const DROPDOWN_W = 320;
const DROPDOWN_H = 360;

export function DatePicker({
  value, onChange, min, max, placeholder = "Select date",
  className = "", style, disabled, highlightDates = [],
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, openUp: false });
  const [view, setView] = useState<Date>(value ? toLocal(value) : new Date());
  const theme = useTheme();
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const reposition = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const openUp = spaceBelow < DROPDOWN_H + 16 && spaceAbove > spaceBelow;
    const left = Math.min(r.left, window.innerWidth - DROPDOWN_W - 12);
    setPos({ top: openUp ? r.top - DROPDOWN_H - 8 : r.bottom + 8, left: Math.max(8, left), openUp });
  }, []);

  useEffect(() => {
    if (!open) return;
    reposition();
    function onClose(e: MouseEvent) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    window.addEventListener("mousedown", onClose);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("mousedown", onClose);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  useEffect(() => { if (value) setView(toLocal(value)); }, [value]);

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

  function select(d: Date) {
    if (isDisabled(d)) return;
    onChange(format(d, "yyyy-MM-dd"));
    setOpen(false);
  }

  const dropdown = open ? (
    <div
      ref={dropRef}
      data-theme={theme}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 9999,
        width: DROPDOWN_W,
        background: "var(--bg-elevated)",
        borderRadius: "var(--radius-xl)",
        padding: "20px 20px 16px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        border: "1px solid var(--border-strong)",
      }}
    >
      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button type="button" onClick={() => setView(v => subMonths(v, 1))}
          style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "var(--bg-hover)", border: "none",
            color: "var(--text-secondary)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.15s",
          }}>
          <ChevronLeft size={16} />
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
          {format(view, "MMMM yyyy")}
        </span>
        <button type="button" onClick={() => setView(v => addMonths(v, 1))}
          style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "var(--bg-hover)", border: "none",
            color: "var(--text-secondary)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.15s",
          }}>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 }}>
        {["Mo","Tu","We","Th","Fr","Sa","Su"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", padding: "4px 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px 0" }}>
        {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
        {days.map(d => {
          const dateStr = format(d, "yyyy-MM-dd");
          const isSel = selected ? isSameDay(d, selected) : false;
          const isTod = isToday(d);
          const dis   = isDisabled(d);
          const hl    = highlightMap.get(dateStr);
          return (
            <button key={dateStr} type="button" disabled={dis} onClick={() => select(d)}
              style={{
                height: 36, width: "100%", borderRadius: "var(--radius-sm)",
                border: isTod && !isSel ? "1.5px solid var(--accent)" : "none",
                background: isSel ? "var(--accent)" : "transparent",
                color: isSel ? "#fff" : dis ? "var(--text-muted)" : hl ? hl : "var(--text-primary)",
                fontSize: 13, fontWeight: isSel || isTod ? 700 : 400,
                cursor: dis ? "not-allowed" : "pointer",
                opacity: dis ? 0.35 : 1,
                display: "flex", alignItems: "center", justifyContent: "center",
                position: "relative", transition: "background 0.12s",
              }}
              onMouseEnter={e => { if (!dis && !isSel) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
              onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              {d.getDate()}
              {hl && !isSel && (
                <span style={{ position: "absolute", bottom: 3, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: "50%", background: hl }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <div ref={triggerRef} className={`relative ${className}`} style={style}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 text-sm text-left"
        style={{
          height: 40,
          background: "var(--bg-subtle)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          color: value ? "var(--text-primary)" : "var(--text-muted)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          fontFamily: "inherit",
          transition: "border-color 0.15s",
        }}
        onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
      >
        <Calendar size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <span className="flex-1 truncate">
          {value ? format(toLocal(value), "d MMM yyyy") : placeholder}
        </span>
      </button>

      {typeof document !== "undefined" && createPortal(dropdown, document.body)}
    </div>
  );
}
