"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns";
import { Download, CalendarPlus, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PlatformBadge } from "@/components/ui/platform-badge";
import { formatCurrency } from "@/lib/utils";
import { Session, formatMYT } from "@/components/schedule/schedule-views";

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = "list" | "calendar" | "day";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mytToday() {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
}

function getMonthRange(dateStr: string) {
  const d = parseISO(dateStr);
  const s = startOfMonth(d);
  const e = endOfMonth(d);
  return {
    start: format(s, "yyyy-MM-dd") + "T00:00:00+08:00",
    end:   format(e, "yyyy-MM-dd") + "T23:59:59+08:00",
  };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MySchedulePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Session | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [currentDate, setCurrentDate] = useState(() => mytToday());

  // currentDate drives the month for list/calendar views, and the day for day view
  const monthStr = currentDate.slice(0, 7);

  function prevMonth() {
    const d = parseISO(currentDate);
    setCurrentDate(format(new Date(d.getFullYear(), d.getMonth() - 1, 1), "yyyy-MM-dd"));
  }
  function nextMonth() {
    const d = parseISO(currentDate);
    setCurrentDate(format(new Date(d.getFullYear(), d.getMonth() + 1, 1), "yyyy-MM-dd"));
  }
  function prevDay() {
    const d = parseISO(currentDate);
    d.setDate(d.getDate() - 1);
    setCurrentDate(format(d, "yyyy-MM-dd"));
  }
  function nextDay() {
    const d = parseISO(currentDate);
    d.setDate(d.getDate() + 1);
    setCurrentDate(format(d, "yyyy-MM-dd"));
  }
  function goToday() { setCurrentDate(mytToday()); }

  const load = useCallback(async (dateStr: string) => {
    setLoading(true);
    const { start, end } = getMonthRange(dateStr);
    try {
      const res = await fetch(`/api/sessions?start=${start}&end=${end}`);
      if (res.ok) setSessions(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(currentDate); }, [monthStr, load]); // reload when month changes

  // Group sessions by MYT date
  const byDay = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of sessions) {
      const dateStr = format(new Date(new Date(s.scheduledStart).getTime() + 8 * 3_600_000), "yyyy-MM-dd");
      const arr = map.get(dateStr) ?? [];
      arr.push(s);
      map.set(dateStr, arr);
    }
    for (const [, arr] of map) arr.sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
    return map;
  }, [sessions]);

  async function addToCalendar(s: Session) {
    const start = new Date(s.scheduledStart);
    const end   = new Date(s.scheduledEnd);
    const title   = encodeURIComponent(`${s.brand.name} Livestream`);
    const details = encodeURIComponent(`Platform: ${s.platform}${s.room ? `\nRoom: ${s.room.name}` : ""}`);
    const startStr = start.toISOString().replace(/-|:|\.\d{3}/g, "");
    const endStr   = end.toISOString().replace(/-|:|\.\d{3}/g, "");
    window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${details}`, "_blank");
  }

  async function exportICS() {
    const { start, end } = getMonthRange(currentDate);
    const res = await fetch(`/api/export/ics?start=${start}&end=${end}`);
    if (!res.ok) return alert("Export failed");
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "my-schedule.ics"; a.click();
    URL.revokeObjectURL(url);
  }

  const totalThisMonth = sessions.filter(s =>
    format(new Date(new Date(s.scheduledStart).getTime() + 8 * 3_600_000), "yyyy-MM") === monthStr
  ).length;

  return (
    <div className="space-y-4 animate-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>My Schedule</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Your assigned livestream sessions</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            {(["list", "calendar", "day"] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setViewMode(v)}
                className="px-3 py-1.5 text-xs font-semibold capitalize transition-all cursor-pointer"
                style={{
                  background: viewMode === v ? "var(--accent)" : "var(--bg-card)",
                  color: viewMode === v ? "#fff" : "var(--text-secondary)",
                  borderRight: v !== "day" ? "1px solid var(--border)" : "none",
                }}>
                {v}
              </button>
            ))}
          </div>
          <Button variant="outline" onClick={exportICS}><Download size={14} /> Export .ics</Button>
        </div>
      </div>

      {/* Navigation bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={goToday}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-secondary)" }}>
          Today
        </button>
        {viewMode === "day" ? (
          <>
            <button onClick={prevDay} className="p-1.5 rounded-lg border cursor-pointer" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              <ChevronLeft size={15} />
            </button>
            <span className="text-sm font-semibold px-1" style={{ color: "var(--text-primary)" }}>
              {format(parseISO(currentDate), "EEEE, d MMMM yyyy")}
            </span>
            <button onClick={nextDay} className="p-1.5 rounded-lg border cursor-pointer" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              <ChevronRight size={15} />
            </button>
          </>
        ) : (
          <>
            <button onClick={prevMonth} className="p-1.5 rounded-lg border cursor-pointer" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              <ChevronLeft size={15} />
            </button>
            <span className="text-sm font-semibold px-1" style={{ color: "var(--text-primary)" }}>
              {format(parseISO(currentDate), "MMMM yyyy")}
            </span>
            <button onClick={nextMonth} className="p-1.5 rounded-lg border cursor-pointer" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              <ChevronRight size={15} />
            </button>
          </>
        )}
        <span className="text-xs ml-1" style={{ color: "var(--text-muted)" }}>
          {viewMode === "day"
            ? `${(byDay.get(currentDate) ?? []).length} session(s) today`
            : `${totalThisMonth} session(s) this month`}
        </span>
      </div>

      {loading ? (
        <div className="section-card p-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>
      ) : viewMode === "list" ? (
        <ListView byDay={byDay} monthStr={monthStr} onSessionClick={setDetail} />
      ) : viewMode === "calendar" ? (
        <CalendarView byDay={byDay} currentDate={currentDate} setCurrentDate={(d) => { setCurrentDate(d); setViewMode("day"); }} />
      ) : (
        <DayView sessions={byDay.get(currentDate) ?? []} onSessionClick={setDetail} />
      )}

      {/* Session detail modal */}
      {detail && (
        <Modal open={!!detail} onClose={() => setDetail(null)} title="Session Details">
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-3 h-3 rounded-full" style={{ background: detail.brand.color }} />
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{detail.brand.name}</span>
              <StatusBadge status={detail.status} punctuality={detail.punctuality} />
              {detail.isCampaignDay && <Badge variant="warning">Campaign Day</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {detail.room && <InfoRow label="Room" value={detail.room.name} />}
              <InfoRow label="Platform" value={<PlatformBadge platform={detail.platform} showName size="sm" />} />
              <InfoRow label="Scheduled" value={
                `${formatMYT(detail.scheduledStart, "dd MMM yyyy")}  ${formatMYT(detail.scheduledStart, "HH:mm")} – ${formatMYT(detail.scheduledEnd, "HH:mm")}`
              } />
              {detail.actualStart && <InfoRow label="Actual Start" value={formatMYT(detail.actualStart, "HH:mm")} />}
              {detail.gmv !== null && <InfoRow label="GMV" value={formatCurrency(detail.gmv ?? 0)} />}
            </div>
            {detail.notes && (
              <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>
                {detail.notes}
              </div>
            )}
            <div className="flex justify-between pt-2" style={{ borderTop: "1px solid var(--border)" }}>
              <Button variant="outline" size="sm" onClick={() => addToCalendar(detail)}>
                <CalendarPlus size={13} /> Add to Google Calendar
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setDetail(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────

function ListView({ byDay, monthStr, onSessionClick }: {
  byDay: Map<string, Session[]>;
  monthStr: string;
  onSessionClick: (s: Session) => void;
}) {
  const todayStr = mytToday();
  const sortedDays = [...byDay.keys()].filter(d => d.startsWith(monthStr)).sort();

  if (sortedDays.length === 0) {
    return (
      <div className="section-card p-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
        No sessions scheduled for this month.
      </div>
    );
  }

  return (
    <div className="section-card p-4 space-y-4">
      {sortedDays.map(dateStr => {
        const daySessions = byDay.get(dateStr)!;
        const dayObj  = parseISO(dateStr);
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
                {format(dayObj, "EEEE, d MMMM yyyy")}
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{daySessions.length} session(s)</span>
            </div>
            <div className="ml-9 space-y-1.5">
              {daySessions.map(s => <SessionRow key={s.id} session={s} onClick={() => onSessionClick(s)} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Calendar view ─────────────────────────────────────────────────────────────

function CalendarView({ byDay, currentDate, setCurrentDate }: {
  byDay: Map<string, Session[]>;
  currentDate: string;
  setCurrentDate: (d: string) => void;
}) {
  const todayStr = mytToday();
  const d = parseISO(currentDate);
  const monthStart = startOfMonth(d);
  const monthEnd   = endOfMonth(d);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const weeks: (Date | null)[][] = [];
  let week: (Date | null)[] = [];
  const firstDow = (getDay(monthStart) + 6) % 7; // Monday-first
  for (let i = 0; i < firstDow; i++) week.push(null);
  for (const day of days) {
    week.push(day);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }

  const dowLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="section-card p-4">
      <div className="grid grid-cols-7 mb-1">
        {dowLabels.map(l => (
          <div key={l} className="text-center text-xs font-semibold py-2" style={{ color: "var(--text-muted)" }}>{l}</div>
        ))}
      </div>
      <div className="space-y-1">
        {weeks.map((wk, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {wk.map((day, di) => {
              if (!day) return <div key={di} />;
              const dateStr = format(day, "yyyy-MM-dd");
              const daySessions = byDay.get(dateStr) ?? [];
              const isToday   = dateStr === todayStr;
              const hasSession = daySessions.length > 0;
              return (
                <button key={di} onClick={() => setCurrentDate(dateStr)}
                  className="relative rounded-xl p-1.5 text-xs font-semibold transition-all cursor-pointer"
                  style={{
                    minHeight: 52,
                    background: isToday ? "var(--accent)" : hasSession ? "var(--accent-light)" : "var(--bg-subtle)",
                    color: isToday ? "#fff" : hasSession ? "var(--accent)" : "var(--text-muted)",
                    border: hasSession && !isToday ? "1px solid var(--accent)" : "1px solid transparent",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 2,
                  }}>
                  <span>{format(day, "d")}</span>
                  {daySessions.slice(0, 2).map(s => (
                    <span key={s.id} className="block w-full truncate text-[9px] rounded px-1 font-medium"
                      style={{ background: s.brand.color, color: "#fff", lineHeight: "16px" }}>
                      {formatMYT(s.scheduledStart, "HH:mm")} {s.brand.name}
                    </span>
                  ))}
                  {daySessions.length > 2 && (
                    <span className="text-[9px]" style={{ color: isToday ? "rgba(255,255,255,0.8)" : "var(--text-muted)" }}>
                      +{daySessions.length - 2} more
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Day view ──────────────────────────────────────────────────────────────────

function DayView({ sessions, onSessionClick }: {
  sessions: Session[];
  onSessionClick: (s: Session) => void;
}) {
  if (sessions.length === 0) {
    return (
      <div className="section-card p-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
        No sessions scheduled for this day.
      </div>
    );
  }

  return (
    <div className="section-card p-4 space-y-2">
      {sessions.map(s => {
        const start = formatMYT(s.scheduledStart, "HH:mm");
        const end   = formatMYT(s.scheduledEnd,   "HH:mm");
        const durationH = (new Date(s.scheduledEnd).getTime() - new Date(s.scheduledStart).getTime()) / 3_600_000;
        return (
          <button key={s.id} onClick={() => onSessionClick(s)}
            className="w-full text-left flex gap-4 rounded-xl p-4 transition-all cursor-pointer"
            style={{ background: `${s.brand.color}18`, border: `2px solid ${s.brand.color}40` }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = s.brand.color)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = `${s.brand.color}40`)}>
            {/* Time column */}
            <div className="flex-shrink-0 text-center w-14">
              <div className="text-sm font-bold" style={{ color: s.brand.color }}>{start}</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>–</div>
              <div className="text-sm font-bold" style={{ color: s.brand.color }}>{end}</div>
              <div className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>{durationH.toFixed(1)}h</div>
            </div>
            {/* Divider */}
            <div className="w-0.5 self-stretch rounded-full flex-shrink-0" style={{ background: s.brand.color }} />
            {/* Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{s.brand.name}</span>
                <PlatformBadge platform={s.platform} showName size="sm" />
                {s.isCampaignDay && <Badge variant="warning">Campaign</Badge>}
                <StatusBadge status={s.status} punctuality={s.punctuality} />
              </div>
              <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
                {s.room && (
                  <span className="flex items-center gap-1">
                    <Clock size={11} /> {s.room.name}
                  </span>
                )}
                {s.gmv !== null && <span>GMV: {formatCurrency(s.gmv ?? 0)}</span>}
              </div>
              {s.notes && (
                <p className="mt-1.5 text-xs rounded px-2 py-1" style={{ background: "var(--bg-subtle)", color: "var(--text-muted)" }}>
                  {s.notes}
                </p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Session row (used in list view) ──────────────────────────────────────────

function SessionRow({ session: s, onClick }: { session: Session; onClick: () => void }) {
  const start = formatMYT(s.scheduledStart, "HH:mm");
  const end   = formatMYT(s.scheduledEnd,   "HH:mm");
  return (
    <button onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer"
      style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
      <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: s.brand.color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{s.brand.name}</span>
          {s.isCampaignDay && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: "#f59e0b20", color: "#f59e0b" }}>Campaign</span>
          )}
          <PlatformBadge platform={s.platform} size="sm" />
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
          <span>{start} – {end}</span>
          {s.room && <><span>·</span><span>{s.room.name}</span></>}
        </div>
      </div>
      <StatusBadge status={s.status} punctuality={s.punctuality} />
    </button>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div>
      <div className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="font-medium" style={{ color: "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

function StatusBadge({ status, punctuality }: { status: string; punctuality: string | null }) {
  if (status === "PENDING")   return <Badge variant="secondary">Upcoming</Badge>;
  if (status === "MISSED")    return <Badge variant="destructive">Missed</Badge>;
  if (punctuality === "EARLY")   return <Badge variant="default">Early ✓</Badge>;
  if (punctuality === "ON_TIME") return <Badge variant="success">On Time ✓</Badge>;
  if (punctuality === "LATE")    return <Badge variant="warning">Late</Badge>;
  return <Badge variant="success">Done</Badge>;
}
