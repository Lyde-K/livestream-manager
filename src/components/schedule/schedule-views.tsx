"use client";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO } from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight, LayoutGrid, Calendar } from "lucide-react";
import { useTheme } from "@/components/ui/date-picker";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Room { id: string; name: string; }
export interface Host { id: string; displayName: string; type: string; user: { name: string }; }
export interface Session {
  id: string; roomId: string | null; liveHostId: string | null; brandId: string; platform: string;
  scheduledStart: string; scheduledEnd: string; isCampaignDay: boolean; notes: string | null;
  slotColor: string | null; status: string; punctuality: string | null; gmv: number | null;
  actualStart: string | null;
  room: Room | null;
  brand: { id: string; name: string; color: string; platform?: string };
  liveHost: { user: { name: string }; displayName: string } | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export const TIME_SLOTS = [
  { label: "8am–10am",  start:  8, end: 10 },
  { label: "10am–12pm", start: 10, end: 12 },
  { label: "12pm–2pm",  start: 12, end: 14 },
  { label: "3pm–5pm",   start: 15, end: 17 },
  { label: "5pm–7pm",   start: 17, end: 19 },
  { label: "8pm–10pm",  start: 20, end: 22 },
  { label: "10pm–12am", start: 22, end: 24 },
  { label: "12am–2am",  start: 24, end: 26 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatMYT(iso: string, fmt: string): string {
  const d = new Date(iso);
  const myt = new Date(d.getTime() + 8 * 3600_000);
  return format(parseISO(myt.toISOString().slice(0, 16)), fmt);
}

export function sessionOverlapsSlot(session: Session, slot: { start: number; end: number }): boolean {
  const d = new Date(session.scheduledStart);
  const myt = new Date(d.getTime() + 8 * 3600_000);
  let h = myt.getUTCHours() + myt.getUTCMinutes() / 60;
  if (h < 4) h += 24;
  const endD = new Date(session.scheduledEnd);
  const endMyt = new Date(endD.getTime() + 8 * 3600_000);
  let eh = endMyt.getUTCHours() + endMyt.getUTCMinutes() / 60;
  if (eh < 4) eh += 24;
  return h < slot.end && eh > slot.start;
}


// ── Portal position hook ──────────────────────────────────────────────────────

function usePortalPos(open: boolean, triggerRef: React.RefObject<HTMLElement | null>, dropH = 380) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const reposition = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < dropH + 16 && r.top > spaceBelow;
    const top = openUp ? r.top - dropH - 8 : r.bottom + 8;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 320 - 8));
    setPos({ top, left });
  }, [triggerRef, dropH]);

  useEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  return pos;
}

// ── DayDatePicker ─────────────────────────────────────────────────────────────

export function DayDatePicker({ gridDate, setGridDate }: { gridDate: string; setGridDate: (d: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => parseISO(gridDate));
  const theme = useTheme();
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const pos = usePortalPos(open, triggerRef);

  const d = parseISO(gridDate);
  const label = format(d, "d/M/yyyy EEEE");
  const todayStr = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (dropRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const days = eachDayOfInterval({ start: startOfMonth(pickerMonth), end: endOfMonth(pickerMonth) });
  const firstDow = (getDay(startOfMonth(pickerMonth)) + 6) % 7;

  const isDark = theme !== "light";
  const dropBg   = isDark ? "rgba(13,27,48,0.99)" : "#ffffff";
  const navBg    = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const navColor = isDark ? "#94a3b8" : "#475569";
  const headColor = isDark ? "#f8fafc" : "#07111f";
  const mutedCol  = isDark ? "#64748b" : "#94a3b8";
  const dayCol    = isDark ? "#f8fafc" : "#07111f";
  const hoverBg   = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";

  const dropdown = open ? (
    <div ref={dropRef} data-theme={theme} onMouseDown={e => e.stopPropagation()}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, width: 320, background: dropBg, borderRadius: 20, padding: "20px 20px 16px", boxShadow: isDark ? "0 20px 60px rgba(0,0,0,0.6)" : "0 8px 40px rgba(0,0,0,0.14)", border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(0,0,0,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button type="button" onClick={() => setPickerMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          style={{ width: 36, height: 36, borderRadius: "50%", background: navBg, border: "none", color: navColor, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ChevronLeft size={16} />
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, color: headColor }}>{format(pickerMonth, "MMMM yyyy")}</span>
        <button type="button" onClick={() => setPickerMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          style={{ width: 36, height: 36, borderRadius: "50%", background: navBg, border: "none", color: navColor, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ChevronRight size={16} />
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 }}>
        {["Mo","Tu","We","Th","Fr","Sa","Su"].map(l => (
          <div key={l} style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: mutedCol, padding: "4px 0" }}>{l}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px 0" }}>
        {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
        {days.map(day => {
          const ds = format(day, "yyyy-MM-dd");
          const isActive = ds === gridDate;
          const isTod = ds === todayStr;
          return (
            <button key={ds} type="button" onClick={() => { setGridDate(ds); setOpen(false); }}
              style={{ height: 38, width: "100%", borderRadius: "50%", border: isTod && !isActive ? "1.5px solid #1677ff" : "none", background: isActive ? "#1677ff" : "transparent", color: isActive ? "#fff" : dayCol, fontSize: 14, fontWeight: isActive || isTod ? 700 : 400, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.12s" }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = hoverBg; }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <div className="relative" ref={triggerRef}>
      <button onClick={() => { setOpen(v => !v); setPickerMonth(parseISO(gridDate)); }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all cursor-pointer"
        style={{ borderColor: open ? "var(--accent)" : "var(--border)", background: "var(--panel-header-bg)", color: "var(--text-primary)" }}>
        {label}
        <ChevronDown size={13} style={{ transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {typeof document !== "undefined" && createPortal(dropdown, document.body)}
    </div>
  );
}

// ── MonthDatePicker ───────────────────────────────────────────────────────────

export function MonthDatePicker({ gridDate, setGridDate }: { gridDate: string; setGridDate: (d: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date(gridDate).getFullYear());
  const theme = useTheme();
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const pos = usePortalPos(open, triggerRef, 260);

  const d = parseISO(gridDate);
  const label = format(d, "MMMM yyyy");
  const activeMonth = d.getMonth();
  const activeYear  = d.getFullYear();

  const isDark = theme !== "light";
  const dropBg   = isDark ? "rgba(13,27,48,0.99)" : "#ffffff";
  const navBg    = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const navColor = isDark ? "#94a3b8" : "#475569";
  const headColor = isDark ? "#f8fafc" : "#07111f";

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (dropRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const dropdown = open ? (
    <div ref={dropRef} data-theme={theme} onMouseDown={e => e.stopPropagation()}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, width: 280, background: dropBg, borderRadius: 20, padding: "20px", boxShadow: isDark ? "0 20px 60px rgba(0,0,0,0.6)" : "0 8px 40px rgba(0,0,0,0.14)", border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(0,0,0,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button type="button" onClick={() => setPickerYear(y => y - 1)}
          style={{ width: 36, height: 36, borderRadius: "50%", background: navBg, border: "none", color: navColor, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ChevronLeft size={16} />
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, color: headColor }}>{pickerYear}</span>
        <button type="button" onClick={() => setPickerYear(y => y + 1)}
          style={{ width: 36, height: 36, borderRadius: "50%", background: navBg, border: "none", color: navColor, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ChevronRight size={16} />
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {MONTHS_SHORT.map((m, i) => {
          const isActive = activeMonth === i && activeYear === pickerYear;
          return (
            <button key={m} type="button"
              onClick={() => { setGridDate(format(new Date(pickerYear, i, 1), "yyyy-MM-dd")); setOpen(false); }}
              style={{ padding: "8px 0", borderRadius: 12, border: isActive ? "none" : `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, background: isActive ? "#1677ff" : navBg, color: isActive ? "#fff" : isDark ? "#94a3b8" : "#475569", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "background 0.12s" }}>
              {m}
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <div className="relative" ref={triggerRef}>
      <button onClick={() => { setOpen(v => !v); setPickerYear(activeYear); }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all cursor-pointer"
        style={{ borderColor: open ? "var(--accent)" : "var(--border)", background: "var(--panel-header-bg)", color: "var(--text-primary)" }}>
        {label}
        <ChevronDown size={13} style={{ transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {typeof document !== "undefined" && createPortal(dropdown, document.body)}
    </div>
  );
}

// ── DailyListView ─────────────────────────────────────────────────────────────

interface DailyListViewProps {
  gridDate: string;
  setGridDate: (d: string) => void;
  sessions: Session[];
  filterHost?: string;
  filterBrand?: string;
  filterRoom?: string;
  filterType?: string;
  is24h?: boolean;
  onSessionClick: (s: Session) => void;
}

export function DailyListView({
  gridDate, setGridDate, sessions,
  filterHost = "", filterBrand = "", filterRoom = "", filterType = "",
  is24h = true, onSessionClick,
}: DailyListViewProps) {
  const monthStr = gridDate.slice(0, 7);

  const byDay = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of sessions) {
      if (!s.scheduledStart.slice(0, 7).startsWith(monthStr)) continue;
      if (filterHost  && s.liveHostId !== filterHost)  continue;
      if (filterBrand && s.brandId    !== filterBrand) continue;
      if (filterRoom  && s.roomId     !== filterRoom)  continue;
      if (filterType  && s.platform   !== filterType)  continue;
      const dateStr = format(new Date(new Date(s.scheduledStart).getTime() + 8 * 3600_000), "yyyy-MM-dd");
      const arr = map.get(dateStr) ?? [];
      arr.push(s);
      map.set(dateStr, arr);
    }
    for (const [, arr] of map) arr.sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
    return map;
  }, [sessions, monthStr, filterHost, filterBrand, filterRoom, filterType]);

  const sortedDays = useMemo(() => [...byDay.keys()].sort(), [byDay]);
  const timeFmt = is24h ? "HH:mm" : "h:mm a";
  const todayStr = format(new Date(), "yyyy-MM-dd");

  function prevMonth() {
    const d = parseISO(gridDate);
    setGridDate(format(new Date(d.getFullYear(), d.getMonth() - 1, 1), "yyyy-MM-dd"));
  }
  function nextMonth() {
    const d = parseISO(gridDate);
    setGridDate(format(new Date(d.getFullYear(), d.getMonth() + 1, 1), "yyyy-MM-dd"));
  }

  return (
    <div className="section-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setGridDate(format(new Date(), "yyyy-MM-dd"))}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-secondary)" }}>
          Today
        </button>
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="p-1.5 rounded-lg border transition-all cursor-pointer"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
            <ChevronLeft size={15} />
          </button>
          <MonthDatePicker gridDate={gridDate} setGridDate={setGridDate} />
          <button onClick={nextMonth} className="p-1.5 rounded-lg border transition-all cursor-pointer"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
            <ChevronRight size={15} />
          </button>
        </div>
        <span className="text-xs ml-1" style={{ color: "var(--text-muted)" }}>
          {[...byDay.values()].reduce((n, arr) => n + arr.length, 0)} session(s)
        </span>
      </div>

      {sortedDays.length === 0 ? (
        <p className="text-center text-sm py-10" style={{ color: "var(--text-muted)" }}>No sessions for this month.</p>
      ) : (
        <div className="space-y-4">
          {sortedDays.map(dateStr => {
            const daySessions = byDay.get(dateStr)!;
            const dayObj = parseISO(dateStr);
            const dayLabel = format(dayObj, "EEEE, d MMMM yyyy");
            const isToday = dateStr === todayStr;
            return (
              <div key={dateStr}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0"
                    style={isToday
                      ? { background: "var(--accent)", color: "#fff" }
                      : { background: "var(--bg-subtle)", color: "var(--text-muted)" }}>
                    {format(dayObj, "d")}
                  </div>
                  <span className="text-sm font-semibold" style={{ color: isToday ? "var(--accent)" : "var(--text-primary)" }}>
                    {dayLabel}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{daySessions.length} session(s)</span>
                </div>
                <div className="ml-9 space-y-1.5">
                  {daySessions.map(s => {
                    const startLabel = formatMYT(s.scheduledStart, timeFmt);
                    const endLabel   = formatMYT(s.scheduledEnd,   timeFmt);
                    const hostName = s.liveHost?.displayName ?? s.liveHost?.user?.name ?? "Unassigned";
                    return (
                      <button key={s.id} onClick={() => onSessionClick(s)}
                        className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer"
                        style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
                        <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: s.brand?.color ?? "var(--accent)" }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{s.brand?.name ?? "—"}</span>
                            {s.isCampaignDay && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: "#f59e0b20", color: "#f59e0b" }}>Campaign</span>
                            )}
                            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                              {s.platform}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                            <span>{startLabel} – {endLabel}</span>
                            <span>·</span>
                            <span>{hostName}</span>
                            {s.room && <><span>·</span><span>{s.room.name}</span></>}
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium capitalize"
                            style={{
                              background: s.status === "COMPLETED" ? "#22c55e20" : s.status === "MISSED" ? "#ef444420" : "var(--bg-card)",
                              color: s.status === "COMPLETED" ? "#22c55e" : s.status === "MISSED" ? "#ef4444" : "var(--text-muted)",
                              border: "1px solid currentColor",
                            }}>
                            {s.status.toLowerCase()}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── DailyGridView ─────────────────────────────────────────────────────────────

type Clipboard =
  | { kind: "brand"; brandId: string; brandName: string; brandColor: string; platform: string; isCampaignDay: boolean }
  | { kind: "host";  liveHostId: string | null; hostName: string }
  | null;

type UndoEntry =
  | { action: "created"; sessionId: string }
  | { action: "updated"; sessionId: string; prev: NonNullable<Clipboard> };

interface DailyGridViewProps {
  gridDate: string;
  setGridDate: (d: string) => void;
  sessions: Session[];
  rooms: Room[];
  hosts?: Host[];
  filterBrand?: string;
  filterRoom?: string;
  filterType?: string;
  filterHost?: string;
  onSessionClick: (s: Session) => void;
  onAddSlot?: (roomId: string, start: string, end: string) => void;
  onPasteSlot?: (roomId: string, start: string, end: string, cb: NonNullable<Clipboard>) => Promise<string>;
  onUpdateSlot?: (sessionId: string, cb: NonNullable<Clipboard>) => Promise<void>;
  onDeleteSlot?: (sessionId: string) => Promise<void>;
}

export function DailyGridView({
  gridDate, setGridDate, sessions, rooms, hosts = [],
  filterBrand = "", filterRoom = "", filterType = "", filterHost = "",
  onSessionClick, onAddSlot, onPasteSlot, onUpdateSlot, onDeleteSlot,
}: DailyGridViewProps) {
  const [editMode, setEditMode] = useState(false);
  // unified selection: which row + cell is highlighted (source for Ctrl+C, target for Ctrl+V)
  const [selected, setSelected] = useState<{ kind: "brand" | "host"; cellKey: string } | null>(null);
  const [clipboard, setClipboard] = useState<Clipboard>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);

  function pushUndo(entry: UndoEntry) { setUndoStack(s => [...s, entry]); }

  function exitEditMode() {
    setEditMode(false);
    setSelected(null);
    setClipboard(null);
    setUndoStack([]);
  }

  function slotDatetime(h: number): string {
    const extra = h >= 24 ? 1 : 0;
    const hh = h >= 24 ? h - 24 : h;
    const base = parseISO(gridDate);
    base.setDate(base.getDate() + extra);
    return `${format(base, "yyyy-MM-dd")}T${String(hh).padStart(2, "0")}:00`;
  }

  function prevDay() {
    const d = parseISO(gridDate);
    d.setDate(d.getDate() - 1);
    setGridDate(format(d, "yyyy-MM-dd"));
  }
  function nextDay() {
    const d = parseISO(gridDate);
    d.setDate(d.getDate() + 1);
    setGridDate(format(d, "yyyy-MM-dd"));
  }

  const daySessions = useMemo(() => sessions.filter((s) => {
    const d = new Date(s.scheduledStart);
    const myt = new Date(d.getTime() + 8 * 3600_000);
    const sessionDate = myt.toISOString().slice(0, 10);
    return sessionDate === gridDate &&
      (!filterHost  || s.liveHostId === filterHost) &&
      (!filterBrand || s.brandId    === filterBrand) &&
      (!filterRoom  || s.roomId     === filterRoom) &&
      (!filterType  || ((s.liveHost as unknown as { type?: string } | null)?.type ?? "FULL_TIME") === filterType);
  }), [sessions, gridDate, filterHost, filterBrand, filterRoom, filterType]);

  const sortedRooms = useMemo(() =>
    [...rooms].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }))
  , [rooms]);

  const filtersActive = !!(filterHost || filterBrand || filterRoom || filterType);

  const allRoomsForDay = useMemo(() =>
    filterRoom ? sortedRooms.filter(r => r.id === filterRoom) : sortedRooms
  , [sortedRooms, filterRoom]);

  const visibleRooms = useMemo(() => filtersActive
    ? allRoomsForDay.filter(r => daySessions.some(s => s.roomId === r.id))
    : allRoomsForDay
  , [filtersActive, allRoomsForDay, daySessions]);

  const activeSlots = useMemo(() => filtersActive
    ? TIME_SLOTS.filter(slot => daySessions.some(s => sessionOverlapsSlot(s, slot)))
    : TIME_SLOTS
  , [filtersActive, daySessions]);

  const roomSlotMap = useMemo(() => {
    const map = new Map<string, Session>();
    for (const s of daySessions) {
      activeSlots.forEach((slot, i) => {
        if (s.roomId && sessionOverlapsSlot(s, slot)) map.set(`${s.roomId}|${i}`, s);
      });
    }
    return map;
  }, [daySessions, activeSlots]);

  // Reset when day changes or edit mode exits
  useEffect(() => {
    setSelected(null);
    setClipboard(null);
    setUndoStack([]);
  }, [gridDate, editMode]);

  // Keyboard shortcuts — only active in edit mode
  useEffect(() => {
    if (!editMode) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { exitEditMode(); return; }

      // Ctrl+C — copy whatever row is currently selected into clipboard
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && selected) {
        const s = roomSlotMap.get(selected.cellKey);
        if (s) {
          if (selected.kind === "host") {
            setClipboard({ kind: "host", liveHostId: s.liveHostId, hostName: s.liveHost?.displayName ?? "" });
          } else {
            setClipboard({ kind: "brand", brandId: s.brandId, brandName: s.brand.name, brandColor: s.brand.color, platform: s.platform, isCampaignDay: s.isCampaignDay });
          }
          setSelected(null);
          e.preventDefault();
        }
        return;
      }

      // Ctrl+V — paste clipboard into the currently selected cell
      if ((e.ctrlKey || e.metaKey) && e.key === "v" && clipboard && selected) {
        e.preventDefault();
        const [roomId, siStr] = selected.cellKey.split("|");
        const slot = activeSlots[Number(siStr)];
        if (!slot) return;
        const existing = roomSlotMap.get(selected.cellKey);
        setSelected(null);
        if (existing) {
          const prev: NonNullable<Clipboard> = clipboard.kind === "brand"
            ? { kind: "brand", brandId: existing.brandId, brandName: existing.brand.name, brandColor: existing.brand.color, platform: existing.platform, isCampaignDay: existing.isCampaignDay }
            : { kind: "host", liveHostId: existing.liveHostId, hostName: existing.liveHost?.displayName ?? "" };
          onUpdateSlot?.(existing.id, clipboard).then(() => pushUndo({ action: "updated", sessionId: existing.id, prev }));
        } else if (clipboard.kind === "brand") {
          onPasteSlot?.(roomId, slotDatetime(slot.start), slotDatetime(slot.end), clipboard).then(newId => pushUndo({ action: "created", sessionId: newId }));
        }
        return;
      }

      // Ctrl+Z — undo last paste
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        setUndoStack(stack => {
          if (!stack.length) return stack;
          const entry = stack[stack.length - 1];
          if (entry.action === "created") onDeleteSlot?.(entry.sessionId);
          else onUpdateSlot?.(entry.sessionId, entry.prev);
          return stack.slice(0, -1);
        });
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, selected, clipboard, roomSlotMap, activeSlots, onPasteSlot, onUpdateSlot, onDeleteSlot]);

  const colWidth = 120;
  const labelWidth = 140;

  return (
    <div className="section-card p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setGridDate(format(new Date(), "yyyy-MM-dd"))}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-secondary)" }}>
          Today
        </button>
        <MonthDatePicker gridDate={gridDate} setGridDate={setGridDate} />
        <div className="flex items-center gap-1">
          <button onClick={prevDay} className="p-1.5 rounded-lg border transition-all cursor-pointer"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
            <ChevronLeft size={15} />
          </button>
          <DayDatePicker gridDate={gridDate} setGridDate={setGridDate} />
          <button onClick={nextDay} className="p-1.5 rounded-lg border transition-all cursor-pointer"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
            <ChevronRight size={15} />
          </button>
        </div>
        {/* Edit Mode toggle */}
        <button
          onClick={() => editMode ? exitEditMode() : setEditMode(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer"
          style={{
            borderColor: editMode ? "var(--accent)" : "var(--border)",
            background: editMode ? "var(--accent)" : "var(--bg-card)",
            color: editMode ? "#fff" : "var(--text-secondary)",
            marginLeft: "auto",
          }}>
          {editMode ? "✓ Exit Edit Mode" : "⎘ Edit Mode"}
        </button>
      </div>

      {/* Edit mode banner */}
      {editMode && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", flexWrap: "wrap",
          borderRadius: "var(--radius-sm)", background: "var(--accent-light)",
          border: "1px solid var(--accent)", fontSize: 11, color: "var(--accent)",
        }}>
          {clipboard && selected ? (
            <>
              <span style={{ fontWeight: 700 }}>⎘ Clipboard:</span>
              {clipboard.kind === "brand"
                ? <span style={{ background: clipboard.brandColor, color: "#fff", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>{clipboard.brandName}</span>
                : <span style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 6px" }}>{clipboard.hostName || "No host"}</span>}
              <span style={{ color: "var(--text-muted)" }}>→ target selected — <strong>Ctrl+V</strong> to paste · <strong>Ctrl+C</strong> to copy new</span>
            </>
          ) : clipboard ? (
            <>
              <span style={{ fontWeight: 700 }}>⎘ Clipboard:</span>
              {clipboard.kind === "brand"
                ? <span style={{ background: clipboard.brandColor, color: "#fff", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>{clipboard.brandName}</span>
                : <span style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 6px" }}>{clipboard.hostName || "No host"}</span>}
              <span style={{ color: "var(--text-muted)" }}>— click target cell then <strong>Ctrl+V</strong> · or click a cell + <strong>Ctrl+C</strong> to copy new</span>
            </>
          ) : selected ? (
            <>
              <span style={{ fontWeight: 700 }}>Selected {selected.kind === "brand" ? "brand" : "host"}:</span>
              <span style={{ color: "var(--text-muted)" }}>press <strong>Ctrl+C</strong> to copy</span>
            </>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>
              Click <strong style={{ color: "var(--accent)" }}>Store row</strong> or <strong style={{ color: "var(--accent)" }}>Host row</strong> to select · <strong>Ctrl+C</strong> copy · <strong>Ctrl+V</strong> paste · Esc exit
            </span>
          )}
          {undoStack.length > 0 && (
            <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: 10 }}>
              Ctrl+Z to undo ({undoStack.length})
            </span>
          )}
        </div>
      )}

      {(filtersActive && daySessions.length === 0) ? (() => {
        const selectedHost = filterHost ? hosts.find(h => h.id === filterHost) : null;
        const msg = selectedHost
          ? `${selectedHost.user.name} has no session for the day.`
          : "No sessions scheduled for this day.";
        return <p className="text-center text-sm py-8" style={{ color: "var(--text-muted)" }}>{msg}</p>;
      })() : <div className="overflow-x-auto">
        <table style={{ borderCollapse: "collapse", minWidth: labelWidth + colWidth * activeSlots.length }}>
          <colgroup>
            <col style={{ width: labelWidth }} />
            {activeSlots.map((_, i) => <col key={i} style={{ width: colWidth }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", padding: "6px 10px", textAlign: "left", fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
                Room / Date
              </th>
              {activeSlots.map((slot, i) => (
                <th key={i} style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", padding: "6px 8px", textAlign: "center", fontSize: 11, color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>
                  <div style={{ fontWeight: 700, color: "var(--text-secondary)" }}>Slot {TIME_SLOTS.indexOf(slot) + 1}</div>
                  <div>{slot.label}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRooms.length === 0 && (
              <tr>
                <td colSpan={activeSlots.length + 1} style={{ padding: "24px", textAlign: "center", fontSize: 13, color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                  {daySessions.length === 0 ? "No sessions scheduled for this day." : "No rooms configured."}
                </td>
              </tr>
            )}
            {visibleRooms.map(room => {
              const roomSessions = daySessions.filter(s => s.roomId === room.id);
              const brand = roomSessions[0]?.brand ?? null;
              const roomLabel = brand ? `${room.name} [${brand.name}]` : room.name;
              return (
                <React.Fragment key={room.id}>
                  <tr>
                    <td colSpan={activeSlots.length + 1} style={{
                      background: brand?.color ? `${brand.color}22` : "var(--bg-subtle)",
                      border: "1px solid var(--border)", padding: "4px 10px",
                      fontSize: 11, fontWeight: 700, color: brand?.color ?? "var(--text-secondary)",
                    }}>
                      {roomLabel}
                    </td>
                  </tr>
                  {/* Store row */}
                  <tr>
                    <td style={{ border: "1px solid var(--border)", padding: "4px 10px", fontSize: 11, color: "var(--text-muted)", background: "var(--bg-subtle)" }}>Store</td>
                    {activeSlots.map((slot, si) => {
                      const cellKey = `${room.id}|${si}`;
                      const session = roomSlotMap.get(cellKey) ?? null;
                      const isSel = selected?.kind === "brand" && selected.cellKey === cellKey;

                      if (!session) return (
                        <td key={si}
                          title={editMode && clipboard?.kind === "brand" ? "Click to select as paste target, then Ctrl+V" : !editMode && onAddSlot ? "Click to add session" : undefined}
                          onClick={() => {
                            if (editMode) setSelected(isSel ? null : { kind: "brand", cellKey });
                            else if (onAddSlot) onAddSlot(room.id, slotDatetime(slot.start), slotDatetime(slot.end));
                          }}
                          style={{
                            border: isSel ? "2px dashed var(--accent)" : "1px solid var(--border)",
                            background: isSel ? "var(--accent-light)" : "var(--bg-card)",
                            cursor: editMode || onAddSlot ? "pointer" : "default",
                            textAlign: "center", verticalAlign: "middle", transition: "background 0.15s",
                          }}>
                          {isSel
                            ? <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>⎘</span>
                            : !editMode && onAddSlot ? <span style={{ fontSize: 14, color: "var(--text-muted)", opacity: 0.4 }}>+</span>
                            : null}
                        </td>
                      );

                      const bg = session.brand.color || "#888";
                      return (
                        <td key={si}
                          title={editMode ? (isSel ? "Ctrl+C to copy · Ctrl+V to paste here" : "Click to select") : "Click to open"}
                          onClick={() => {
                            if (editMode) setSelected(isSel ? null : { kind: "brand", cellKey });
                            else onSessionClick(session);
                          }}
                          style={{
                            border: isSel ? "2.5px solid var(--accent)" : "1px solid var(--border)",
                            padding: "3px 6px", background: bg, cursor: "pointer", verticalAlign: "middle",
                            boxShadow: isSel ? "0 0 0 2px var(--accent)" : undefined,
                            position: "relative",
                          }}>
                          <div style={{ color: "#fff", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{session.brand.name}</div>
                          <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 9 }}>{session.platform}</div>
                          {isSel && <span style={{ position: "absolute", top: 2, right: 3, fontSize: 8, color: "rgba(255,255,255,0.9)", fontWeight: 700 }}>●</span>}
                        </td>
                      );
                    })}
                  </tr>
                  {/* Host row */}
                  <tr>
                    <td style={{ border: "1px solid var(--border)", padding: "4px 10px", fontSize: 11, color: "var(--text-muted)", background: "var(--bg-subtle)" }}>Host</td>
                    {activeSlots.map((slot, si) => {
                      const cellKey = `${room.id}|${si}`;
                      const session = roomSlotMap.get(cellKey) ?? null;
                      const isSel = selected?.kind === "host" && selected.cellKey === cellKey;

                      if (!session) return (
                        <td key={si}
                          onClick={() => { if (!editMode && onAddSlot) onAddSlot(room.id, slotDatetime(slot.start), slotDatetime(slot.end)); }}
                          style={{
                            border: "1px solid var(--border)", background: "var(--bg-card)",
                            cursor: !editMode && onAddSlot ? "pointer" : "default",
                            textAlign: "center", verticalAlign: "middle",
                          }}>
                          {!editMode && onAddSlot ? <span style={{ fontSize: 14, color: "var(--text-muted)", opacity: 0.4 }}>+</span> : null}
                        </td>
                      );

                      return (
                        <td key={si}
                          title={editMode ? (isSel ? "Ctrl+C to copy · Ctrl+V to paste here" : "Click to select") : "Click to open"}
                          onClick={() => {
                            if (editMode) setSelected(isSel ? null : { kind: "host", cellKey });
                            else onSessionClick(session);
                          }}
                          style={{
                            border: isSel ? "2.5px solid var(--accent)" : "1px solid var(--border)",
                            padding: "3px 6px", background: "var(--bg-card)", cursor: "pointer", verticalAlign: "middle",
                            boxShadow: isSel ? "0 0 0 2px var(--accent)" : undefined,
                          }}>
                          <div style={{ fontSize: 10, color: isSel ? "var(--accent)" : "var(--text-primary)", fontWeight: isSel ? 700 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {session.liveHost?.displayName ?? "—"}
                          </div>
                          {isSel && <div style={{ fontSize: 8, color: "var(--accent)", fontWeight: 700 }}>●</div>}
                        </td>
                      );
                    })}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>}
    </div>
  );
}

// ── ViewToggle ────────────────────────────────────────────────────────────────

export function ScheduleViewToggle({
  viewMode, setViewMode,
}: { viewMode: "grid" | "dailyList"; setViewMode: (v: "grid" | "dailyList") => void }) {
  return (
    <div className="flex items-center gap-2">
      {(["grid", "dailyList"] as const).map(mode => (
        <button key={mode}
          onClick={() => setViewMode(mode)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all cursor-pointer"
          style={{
            borderColor: viewMode === mode ? "var(--accent)" : "var(--border)",
            color: viewMode === mode ? "var(--accent)" : "var(--text-secondary)",
            background: viewMode === mode ? "color-mix(in oklab, var(--accent) 10%, var(--bg-card))" : "var(--bg-card)",
          }}>
          {mode === "grid" ? <><LayoutGrid size={13} /> Daily Schedule</> : <><Calendar size={13} /> Daily List</>}
        </button>
      ))}
    </div>
  );
}

// ── useGridDate hook ──────────────────────────────────────────────────────────

export function useGridMonthRange(dateStr: string) {
  const d = parseISO(dateStr);
  const first = format(new Date(d.getFullYear(), d.getMonth(), 1), "yyyy-MM-dd");
  const last  = format(new Date(d.getFullYear(), d.getMonth() + 1, 0), "yyyy-MM-dd");
  return { start: `${first}T00:00:00+08:00`, end: `${last}T23:59:59+08:00` };
}

// re-export for convenience
export { useCallback };
