"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { format, parseISO } from "date-fns";
import {
  CalendarOff, CheckCircle2, XCircle, Clock, Plus, ChevronDown, ChevronUp,
  Info, TrendingUp, CircleCheck, Sparkles, Users, AlertCircle,
  Download, Calendar, ChevronLeft, ChevronRight, Ban, History,
  BarChart3, Target, Zap, Hourglass, Sun, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { RLUnit, RLSummary } from "@/app/api/replacement-leave/route";
import { DatePicker } from "@/components/ui/date-picker";

// ── Shared helpers ────────────────────────────────────────────────────────────

type BlackoutDate = { id: string; date: string; reason: string; createdAt?: string };

function mytToday(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}
function mytMinDate(): string {
  return new Date(Date.now() + 8 * 3600_000 + 3 * 86400_000).toISOString().slice(0, 10);
}
function fmtDate(d: string) {
  return format(parseISO(d), "d MMM yyyy");
}

const CATEGORIES = [
  { value: "PERSONAL",  label: "Personal",  color: "#6366f1" },
  { value: "MEDICAL",   label: "Medical",   color: "#ef4444" },
  { value: "FAMILY",    label: "Family",    color: "#f97316" },
  { value: "OTHER",     label: "Other",     color: "#94a3b8" },
];

const HALF_DAY_OPTIONS = [
  { value: "",          label: "Full Day" },
  { value: "MORNING",   label: "Morning (AM)" },
  { value: "AFTERNOON", label: "Afternoon (PM)" },
];

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    PENDING:  { label: "Pending",  bg: "#f59e0b20", color: "#f59e0b" },
    APPROVED: { label: "Approved", bg: "#22c55e20", color: "#22c55e" },
    REJECTED: { label: "Rejected", bg: "#ef444420", color: "#ef4444" },
  };
  const s = map[status] ?? { label: status, bg: "var(--bg-subtle)", color: "var(--text-muted)" };
  return (
    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: s.bg, color: s.color }}>{s.label}</span>
  );
}

function ReasonPill({ reason }: { reason: string }) {
  if (reason === "OFF_DAY") return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "#6366f120", color: "#6366f1" }}>Off-Day</span>
  );
  if (reason === "EXTRA_HOURS") return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "#f9731620", color: "#f97316" }}>Extra Hours</span>
  );
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "var(--bg-subtle)", color: "var(--text-muted)" }}>Manual</span>
  );
}

function CategoryPill({ category }: { category?: string | null }) {
  const cat = CATEGORIES.find(c => c.value === category);
  if (!cat) return null;
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: cat.color + "20", color: cat.color }}>{cat.label}</span>
  );
}

function HalfDayPill({ halfDay }: { halfDay?: string | null }) {
  if (!halfDay) return null;
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: "#0ea5e920", color: "#0ea5e9" }}>
      {halfDay === "MORNING" ? "AM" : "PM"}
    </span>
  );
}

// ── Accrual Progress Bar ──────────────────────────────────────────────────────

function AccrualProgressBar({ summary }: { summary: RLSummary }) {
  const needed = summary.hoursToNextUnit;
  const accumulated = 6 - needed;
  const pct = Math.round((accumulated / 6) * 100);

  return (
    <div className="section-card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Target size={14} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Progress to Next RL Unit
          </span>
        </div>
        <span className="text-xs font-medium tabular-nums" style={{ color: "var(--text-muted)" }}>
          {accumulated.toFixed(1)}h / 6h
        </span>
      </div>
      <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: pct === 100 ? "#22c55e" : "linear-gradient(90deg, var(--accent), #f97316)" }}
        />
      </div>
      <div className="flex justify-between mt-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
        <span>{pct}% complete</span>
        <span>{pct < 100 ? `${needed.toFixed(1)}h to go` : "Ready to use!"}</span>
      </div>
    </div>
  );
}

// ── Leave Calendar (Admin) ────────────────────────────────────────────────────

interface CalendarApp {
  id: string;
  liveHostId: string;
  leaveDate: string;
  halfDay?: string | null;
  status: string;
  liveHost: { id: string; displayName: string };
}

function LeaveCalendar({ apps }: { apps: CalendarApp[] }) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = mytToday();

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const appsByDate = useMemo(() => {
    const map: Record<string, CalendarApp[]> = {};
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    for (const a of apps) {
      if (a.leaveDate.startsWith(prefix)) {
        if (!map[a.leaveDate]) map[a.leaveDate] = [];
        map[a.leaveDate].push(a);
      }
    }
    return map;
  }, [apps, year, month]);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="section-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={14} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Leave Calendar</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1 rounded cursor-pointer" style={{ color: "var(--text-muted)" }}><ChevronLeft size={16} /></button>
          <span className="text-sm font-medium w-24 text-center" style={{ color: "var(--text-primary)" }}>{MONTHS[month]} {year}</span>
          <button onClick={nextMonth} className="p-1 rounded cursor-pointer" style={{ color: "var(--text-muted)" }}><ChevronRight size={16} /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {DAYS_OF_WEEK.map(d => (
          <div key={d} className="text-center text-[10px] font-bold pb-1 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{d}</div>
        ))}
        {cells.map((day, idx) => {
          if (!day) return <div key={`e-${idx}`} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayApps = appsByDate[dateStr] ?? [];
          const isToday = dateStr === today;
          const pendingCount = dayApps.filter(a => a.status === "PENDING").length;
          const approvedCount = dayApps.filter(a => a.status === "APPROVED").length;

          return (
            <div key={dateStr}
              className="rounded-lg p-1 min-h-[52px] text-center flex flex-col gap-0.5"
              style={{
                background: isToday ? "var(--accent)15" : dayApps.length > 0 ? "var(--bg-subtle)" : "transparent",
                border: isToday ? "1px solid var(--accent)40" : "1px solid transparent",
              }}>
              <span className="text-[11px] font-medium" style={{ color: isToday ? "var(--accent)" : "var(--text-muted)" }}>{day}</span>
              {approvedCount > 0 && (
                <span className="text-[9px] font-bold px-1 rounded" style={{ background: "#22c55e20", color: "#22c55e" }}>
                  {approvedCount} approved
                </span>
              )}
              {pendingCount > 0 && (
                <span className="text-[9px] font-bold px-1 rounded" style={{ background: "#f59e0b20", color: "#f59e0b" }}>
                  {pendingCount} pending
                </span>
              )}
              {dayApps.slice(0, 2).map(a => (
                <span key={a.id} className="text-[9px] truncate px-0.5 rounded"
                  style={{ background: a.status === "APPROVED" ? "#22c55e10" : "#f59e0b10", color: a.status === "APPROVED" ? "#22c55e" : "#f59e0b" }}>
                  {a.liveHost.displayName.split(" ")[0]}
                </span>
              ))}
              {dayApps.length > 2 && (
                <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>+{dayApps.length - 2}</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#22c55e" }} />Approved</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#f59e0b" }} />Pending</span>
      </div>
    </div>
  );
}

// ── Apply Leave Modal ─────────────────────────────────────────────────────────

function ApplyLeaveModal({ summary, onClose, onSubmitted }: {
  summary: RLSummary;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const minDate = mytMinDate();
  const [selectedDate, setSelectedDate] = useState("");
  const [halfDay, setHalfDay] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [blackoutDates, setBlackoutDates] = useState<BlackoutDate[]>([]);

  useEffect(() => {
    fetch("/api/replacement-leave/blackout")
      .then(r => r.ok ? r.json() : { blackouts: [] })
      .then(d => setBlackoutDates(Array.isArray(d?.blackouts) ? d.blackouts : []));
  }, []);

  const selectedBlackout = selectedDate ? blackoutDates.find(b => b.date === selectedDate) : null;
  const upcomingBlackouts = blackoutDates
    .filter(b => b.date >= minDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10);

  async function submit() {
    if (!selectedDate) { setError("Please select a date."); return; }
    if (!category) { setError("Please select a leave category."); return; }
    setSaving(true);
    setError("");
    const res = await fetch("/api/replacement-leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leaveDate: selectedDate, notes, halfDay: halfDay || null, category }),
    });
    setSaving(false);
    if (res.ok) { onSubmitted(); }
    else { const d = await res.json(); setError(d.error ?? "Failed to submit"); }
  }

  return (
    <Modal open onClose={onClose} title="Apply for Replacement Leave" size="lg">
      <div className="space-y-5">
        {/* Balance snapshot */}
        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
          <div className="text-center flex-1">
            <div className="text-2xl font-bold" style={{ color: "var(--accent)" }}>{summary.unitsAvailable}</div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>Available</div>
          </div>
          <div className="w-px h-8 self-center" style={{ background: "var(--border)" }} />
          <div className="text-center flex-1">
            <div className="text-2xl font-bold" style={{ color: "var(--text-secondary)" }}>{summary.unitsUsed}</div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>Used</div>
          </div>
          <div className="w-px h-8 self-center" style={{ background: "var(--border)" }} />
          <div className="text-center flex-1">
            <div className="text-2xl font-bold" style={{ color: "#f97316" }}>{summary.hoursToNextUnit.toFixed(1)}h</div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>To next unit</div>
          </div>
        </div>

        {/* Upcoming blackout dates */}
        {upcomingBlackouts.length > 0 && (
          <div className="rounded-xl p-3 space-y-2" style={{ background: "#ef444408", border: "1px solid #ef444430" }}>
            <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "#ef4444" }}>
              <Ban size={12} /> Blackout Dates — Leave cannot be taken on these days
            </div>
            <div className="space-y-1">
              {upcomingBlackouts.map(b => (
                <div key={b.id} className="flex items-center justify-between text-xs">
                  <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {format(parseISO(b.date), "d MMM yyyy (EEE)")}
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>{b.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {summary.unitsAvailable < 1 ? (
          <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: "#ef444410", border: "1px solid #ef444430", color: "#ef4444" }}>
            <AlertCircle size={15} />
            <span className="text-sm">You have no available Replacement Leave units to use.</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                  Select Leave Date * <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>(min. 3 days notice)</span>
                </label>
                <DatePicker
                  value={selectedDate}
                  min={minDate}
                  onChange={v => { setSelectedDate(v); setError(""); }}
                  placeholder="Pick a date…"
                  highlightDates={upcomingBlackouts.map(b => ({ date: b.date, color: "#ef4444" }))}
                  style={{ border: selectedBlackout ? "1px solid #ef4444" : undefined }}
                />
                {selectedBlackout && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs" style={{ color: "#ef4444" }}>
                    <Ban size={11} />
                    <span>This date is blacked out: <strong>{selectedBlackout.reason}</strong>. Please choose another date.</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Category *</label>
                <select value={category} onChange={e => setCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                  <option value="">Select…</option>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Duration</label>
                <select value={halfDay} onChange={e => setHalfDay(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                  {HALF_DAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Notes (optional)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Any additional context for the admin…"
                className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
            </div>

            <div className="flex items-start gap-2 p-2.5 rounded-lg text-xs" style={{ background: "#f59e0b10", color: "#f59e0b" }}>
              <Info size={13} className="mt-0.5 flex-shrink-0" />
              <span>Your scheduled sessions on this day{halfDay === "MORNING" ? " (AM)" : halfDay === "AFTERNOON" ? " (PM)" : ""} will be removed upon admin approval.</span>
            </div>

            {error && (
              <div className="text-sm p-2.5 rounded-lg" style={{ background: "#ef444410", color: "#ef4444" }}>{error}</div>
            )}
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {summary.unitsAvailable > 0 && (
            <Button onClick={submit} loading={saving} disabled={!selectedDate || !category || !!selectedBlackout}>
              <CheckCircle2 size={14} /> Submit Application
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Host View ─────────────────────────────────────────────────────────────────

interface HostApplication {
  id: string; leaveDate: string; status: string; notes?: string | null;
  adminNote?: string | null; createdAt: string; halfDay?: string | null; category?: string | null;
}

function HostView() {
  const [data, setData] = useState<{ summary: RLSummary; applications: HostApplication[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [applyOpen, setApplyOpen] = useState(false);
  const [showContribs, setShowContribs] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/replacement-leave");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function cancelApplication(id: string) {
    await fetch(`/api/replacement-leave/${id}`, { method: "DELETE" });
    setCancelId(null);
    load();
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>
    </div>
  );

  const { summary, applications } = data!;
  const today = mytToday();
  const soon = new Date(Date.now() + 7 * 86_400_000);
  const expiringSoon = summary.units.filter(u => !u.isExpired && new Date(u.expiresAt) <= soon).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>My Leave</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Track and apply for your replacement leave entitlements
          </p>
        </div>
        <Button onClick={() => setApplyOpen(true)} disabled={summary.unitsAvailable < 1}>
          <Plus size={14} /> Apply for Leave
        </Button>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: CircleCheck, label: "Available",         value: summary.unitsAvailable,      color: "#22c55e",           hint: "Ready to use now" },
          { icon: Hourglass,   label: "Expiring Soon",     value: expiringSoon,                color: "#f59e0b",           hint: "Expire within 7 days" },
          { icon: Clock,       label: "Awaiting Approval", value: summary.unitsPendingApproval, color: "#6366f1",          hint: "Applications pending" },
          { icon: TrendingUp,  label: "Used",              value: summary.unitsUsed,            color: "var(--text-muted)", hint: "Approved leaves taken" },
        ].map(({ icon: Icon, label, value, color, hint }) => (
          <div key={label} className="section-card p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 mb-1">
              <Icon size={14} style={{ color }} />
              <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
            </div>
            <div className="text-3xl font-bold" style={{ color }}>{value}</div>
            <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</div>
          </div>
        ))}
      </div>

      {/* Accrual Progress Bar */}
      <AccrualProgressBar summary={summary} />

      {/* How it works */}
      <div className="section-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Info size={14} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>How Replacement Leave Works</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {[
            { title: "How you earn RL", body: "Working on your scheduled off-days during campaigns, or working extra hours beyond 6h standard." },
            { title: "Accumulation", body: "Every 6 excess hours = 1 Replacement Leave day. Hours stack across multiple sessions." },
            { title: "15-Day Window", body: "Each unit is immediately available once earned. You have 15 days to use it before it expires." },
          ].map(({ title, body }) => (
            <div key={title} className="flex flex-col gap-1 p-3 rounded-lg" style={{ background: "var(--bg-subtle)" }}>
              <span className="font-semibold mb-0.5" style={{ color: "var(--text-primary)" }}>{title}</span>
              <span>{body}</span>
            </div>
          ))}
        </div>
      </div>

      {/* RL Units Timeline */}
      {summary.units.length > 0 && (
        <div className="section-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles size={14} style={{ color: "var(--accent)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Earned RL Units</span>
            <span className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>{summary.unitsEarned} total</span>
          </div>
          <div className="space-y-2">
            {summary.units.map((u, i) => {
              const usedUnit = i < summary.unitsUsed;
              const pendingUnit = !usedUnit && i >= summary.unitsUsed && i < summary.unitsUsed + summary.unitsPendingApproval;
              const expired = !usedUnit && !pendingUnit && u.isExpired;
              const available = !usedUnit && !pendingUnit && !u.isExpired;
              const daysLeft = Math.ceil((new Date(u.expiresAt).getTime() - Date.now()) / 86400_000);
              return (
                <div key={u.unitNumber} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                  style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", opacity: usedUnit || expired ? 0.55 : 1 }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{
                      background: expired ? "#94a3b820" : usedUnit ? "var(--bg-card)" : pendingUnit ? "#6366f120" : "#22c55e20",
                      color: expired ? "#94a3b8" : usedUnit ? "var(--text-muted)" : pendingUnit ? "#6366f1" : "#22c55e",
                    }}>
                    {u.unitNumber}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                      Earned {fmtDate(u.triggeredDate)}
                    </div>
                    <div className="text-[11px]" style={{ color: expired ? "#ef4444" : available && daysLeft <= 5 ? "#f59e0b" : "var(--text-muted)" }}>
                      {expired && `Expired ${fmtDate(u.expiresAt)}`}
                      {!expired && `Expires ${fmtDate(u.expiresAt)}${available && daysLeft > 0 ? ` (${daysLeft}d left)` : ""}`}
                    </div>
                  </div>
                  <div>
                    {usedUnit    && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#94a3b815", color: "#94a3b8" }}>Used</span>}
                    {pendingUnit && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#6366f120", color: "#6366f1" }}>Pending Approval</span>}
                    {available   && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#22c55e20", color: "#22c55e" }}>Available</span>}
                    {expired     && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#94a3b815", color: "#94a3b8" }}>Expired</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hour Contributions */}
      {summary.contributions.length > 0 && (
        <div className="section-card overflow-hidden">
          <button
            onClick={() => setShowContribs(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
            style={{ borderBottom: showContribs ? "1px solid var(--border)" : "none" }}>
            <div className="flex items-center gap-2">
              <TrendingUp size={14} style={{ color: "var(--accent)" }} />
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Hours Contribution History</span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {summary.totalHours.toFixed(1)}h total · {summary.contributions.length} entry(s)
              </span>
            </div>
            {showContribs ? <ChevronUp size={15} style={{ color: "var(--text-muted)" }} /> : <ChevronDown size={15} style={{ color: "var(--text-muted)" }} />}
          </button>
          {showContribs && (
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {summary.contributions.map((c, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-20 flex-shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>{fmtDate(c.date)}</div>
                  <ReasonPill reason={c.reason} />
                  <div className="flex-1 text-xs truncate" style={{ color: "var(--text-secondary)" }}>{c.description}</div>
                  <div className="text-xs font-medium tabular-nums flex-shrink-0" style={{ color: c.hours >= 0 ? "#22c55e" : "#ef4444" }}>
                    {c.hours >= 0 ? "+" : ""}{c.hours.toFixed(1)}h
                  </div>
                  <div className="w-16 text-right text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>∑ {c.runningTotal.toFixed(1)}h</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {summary.contributions.length === 0 && (
        <div className="section-card p-8 text-center" style={{ color: "var(--text-muted)" }}>
          <CalendarOff size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No replacement leave earned yet.</p>
          <p className="text-xs mt-1">Work on off-days during campaigns or extra hours beyond 6h to earn RL.</p>
        </div>
      )}

      {/* My Applications */}
      <div className="section-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarOff size={14} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>My Applications</span>
        </div>
        {applications.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: "var(--text-muted)" }}>No applications yet.</p>
        ) : (
          <div className="space-y-2">
            {applications.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{fmtDate(a.leaveDate)}</span>
                    <StatusPill status={a.status} />
                    <HalfDayPill halfDay={a.halfDay} />
                    <CategoryPill category={a.category} />
                    {a.leaveDate < today && a.status === "PENDING" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#f59e0b15", color: "#f59e0b" }}>Past date</span>
                    )}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    Applied {format(new Date(a.createdAt), "d MMM yyyy")}
                    {a.notes && <> · "{a.notes}"</>}
                  </div>
                  {a.adminNote && (
                    <div className="text-xs mt-0.5 italic" style={{ color: "var(--text-secondary)" }}>Admin: {a.adminNote}</div>
                  )}
                </div>
                {a.status === "PENDING" && (
                  <button onClick={() => setCancelId(a.id)}
                    className="text-xs px-2 py-1 rounded cursor-pointer flex-shrink-0"
                    style={{ color: "#ef4444", background: "#ef444415" }}>
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {applyOpen && (
        <ApplyLeaveModal
          summary={summary}
          onClose={() => setApplyOpen(false)}
          onSubmitted={() => { setApplyOpen(false); load(); }}
        />
      )}
      {cancelId && (
        <Modal open onClose={() => setCancelId(null)} title="Cancel Application">
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Are you sure you want to cancel this leave application?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCancelId(null)}>Keep It</Button>
              <Button variant="destructive" onClick={() => cancelApplication(cancelId)}>Yes, Cancel</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Public Holidays Section ───────────────────────────────────────────────────

interface PublicHoliday { id: string; date: string; name: string; year: number; month: number; }

function PublicHolidaySection() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const MONTHS_LABEL = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  async function load() {
    const res = await fetch(`/api/public-holidays?year=${year}&month=${month}`);
    if (res.ok) setHolidays(await res.json());
  }

  useEffect(() => { load(); }, [year, month]);

  async function addHoliday() {
    if (!newDate || !newName.trim()) { setError("Date and name are required."); return; }
    setSaving(true); setError("");
    const res = await fetch("/api/public-holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: newDate, name: newName.trim() }),
    });
    setSaving(false);
    if (res.ok) { setNewDate(""); setNewName(""); load(); }
    else { const d = await res.json(); setError(d.error ?? "Failed to add"); }
  }

  async function removeHoliday(id: string) {
    await fetch("/api/public-holidays", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  return (
    <div className="section-card overflow-hidden">
      <div
        className="w-full flex items-center justify-between px-4 py-3"
        style={{ borderBottom: showPanel ? "1px solid var(--border)" : "none" }}>
        <div className="flex items-center gap-2 flex-1 cursor-pointer" onClick={() => setShowPanel(v => !v)}>
          <Sun size={14} style={{ color: "#f59e0b" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Public Holidays</span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {holidays.length > 0 ? `${holidays.length} this month` : "None set for this month"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="px-2 py-1 rounded-lg text-xs"
            style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
            {MONTHS_LABEL.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="px-2 py-1 rounded-lg text-xs"
            style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="cursor-pointer" onClick={() => setShowPanel(v => !v)}>
            {showPanel ? <ChevronUp size={14} style={{ color: "var(--text-muted)" }} /> : <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />}
          </div>
        </div>
      </div>

      {showPanel && (
        <div className="p-4 space-y-3">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Public holidays are excluded from required working hours when calculating full-time host commission.
          </p>

          {/* Add new */}
          <div className="flex gap-2 flex-wrap">
            <DatePicker value={newDate} onChange={v => { setNewDate(v); setError(""); }} placeholder="Select date…" className="w-36" />
            <input
              type="text"
              value={newName}
              onChange={e => { setNewName(e.target.value); setError(""); }}
              placeholder="Holiday name (e.g. Hari Raya)"
              className="flex-1 px-3 py-2 rounded-lg text-sm"
              style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)", minWidth: 180 }}
            />
            <button
              onClick={addHoliday}
              disabled={saving}
              className="px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={{ background: "var(--accent)", color: "#fff", opacity: saving ? 0.7 : 1 }}>
              <Plus size={14} className="inline mr-1" />Add
            </button>
          </div>
          {error && <div className="text-xs font-medium" style={{ color: "var(--danger)" }}>{error}</div>}

          {/* List */}
          {holidays.length === 0 ? (
            <p className="text-sm text-center py-3" style={{ color: "var(--text-muted)" }}>
              No public holidays set for {MONTHS_LABEL[month-1]} {year}.
            </p>
          ) : (
            <div className="space-y-1">
              {holidays.map(h => (
                <div key={h.id} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                  style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
                  <Sun size={12} style={{ color: "#f59e0b", flexShrink: 0 }} />
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {format(parseISO(h.date), "d MMM yyyy (EEE)")}
                  </span>
                  <span className="flex-1 text-xs truncate" style={{ color: "var(--text-secondary)" }}>{h.name}</span>
                  <button onClick={() => removeHoliday(h.id)}
                    className="p-1 rounded cursor-pointer flex-shrink-0"
                    style={{ color: "#ef4444" }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Admin View ────────────────────────────────────────────────────────────────

interface AdminHostSummary {
  host: { id: string; displayName: string; user: { name: string } };
  summary: RLSummary;
}

interface PendingApp {
  id: string; leaveDate: string; status: string; notes?: string | null; createdAt: string;
  halfDay?: string | null; category?: string | null;
  liveHost: { id: string; displayName: string; user: { name: string } };
}

interface ReviewedApp {
  id: string; leaveDate: string; status: string; halfDay?: string | null; category?: string | null;
  createdAt: string; reviewedAt?: string | null; adminNote?: string | null;
  liveHost: { id: string; displayName: string };
}

// BlackoutDate type defined at top of file
interface AuditLog { id: string; liveHostId?: string | null; action: string; detail: string; performedBy: string; createdAt: string; performerName: string; hostName?: string | null; }

function ApproveModal({ app, onClose, onDone }: {
  app: PendingApp; onClose: () => void; onDone: () => void;
}) {
  const [adminNote, setAdminNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ removedSessions?: { id: string; brand: { name: string }; scheduledStart: string }[] } | null>(null);

  async function act(action: "APPROVE" | "REJECT") {
    setSaving(true);
    const res = await fetch(`/api/replacement-leave/${app.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, adminNote }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      if (action === "APPROVE") { setResult(data); }
      else { onDone(); }
    }
  }

  if (result) {
    return (
      <Modal open onClose={() => { onClose(); onDone(); }} title="Application Approved">
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: "#22c55e10", border: "1px solid #22c55e30" }}>
            <CheckCircle2 size={16} color="#22c55e" />
            <span className="text-sm font-medium" style={{ color: "#22c55e" }}>Leave approved for {app.liveHost.displayName}</span>
          </div>
          {result.removedSessions && result.removedSessions.length > 0 ? (
            <div>
              <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>
                {result.removedSessions.length} session(s) removed from {fmtDate(app.leaveDate)}:
              </p>
              <div className="space-y-1">
                {result.removedSessions.map(s => (
                  <div key={s.id} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>
                    {s.brand.name} · {format(new Date(s.scheduledStart), "HH:mm")}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No pending sessions were found on {fmtDate(app.leaveDate)}.</p>
          )}
          <div className="flex justify-end"><Button onClick={() => { onClose(); onDone(); }}>Done</Button></div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Review Leave Application" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="p-3 rounded-lg" style={{ background: "var(--bg-subtle)" }}>
            <div className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Host</div>
            <div className="font-medium" style={{ color: "var(--text-primary)" }}>{app.liveHost.displayName}</div>
          </div>
          <div className="p-3 rounded-lg" style={{ background: "var(--bg-subtle)" }}>
            <div className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Leave Date</div>
            <div className="font-medium flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
              {fmtDate(app.leaveDate)}
              <HalfDayPill halfDay={app.halfDay} />
            </div>
          </div>
          <div className="p-3 rounded-lg" style={{ background: "var(--bg-subtle)" }}>
            <div className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Category</div>
            <div className="font-medium" style={{ color: "var(--text-primary)" }}><CategoryPill category={app.category} /></div>
          </div>
          {app.notes && (
            <div className="p-3 rounded-lg" style={{ background: "var(--bg-subtle)" }}>
              <div className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Host Notes</div>
              <div className="font-medium italic" style={{ color: "var(--text-secondary)" }}>{app.notes}</div>
            </div>
          )}
        </div>
        <div className="p-3 rounded-lg text-xs" style={{ background: "#f59e0b10", border: "1px solid #f59e0b30", color: "#f59e0b" }}>
          <strong>On Approve:</strong> All pending sessions for {app.liveHost.displayName} on {fmtDate(app.leaveDate)}{app.halfDay === "MORNING" ? " (AM)" : app.halfDay === "AFTERNOON" ? " (PM)" : ""} will be automatically removed.
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Admin Note (optional)</label>
          <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={2}
            placeholder="Add a note for the host…"
            className="w-full px-3 py-2 rounded-lg text-sm resize-none"
            style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => act("REJECT")} loading={saving}><XCircle size={14} /> Reject</Button>
          <Button onClick={() => act("APPROVE")} loading={saving}><CheckCircle2 size={14} /> Approve</Button>
        </div>
      </div>
    </Modal>
  );
}

function AddCreditModal({ hosts, onClose, onDone }: {
  hosts: { id: string; displayName: string }[]; onClose: () => void; onDone: () => void;
}) {
  const [liveHostId, setLiveHostId] = useState("");
  const [date, setDate] = useState(mytToday());
  const [hours, setHours] = useState("6");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!liveHostId || !date || !reason) return;
    setSaving(true);
    await fetch("/api/replacement-leave/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ liveHostId, date, hours: parseFloat(hours), reason }),
    });
    setSaving(false);
    onDone();
  }

  return (
    <Modal open onClose={onClose} title="Add Manual RL Credit" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Host *</label>
            <select value={liveHostId} onChange={e => setLiveHostId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
              <option value="">Select host…</option>
              {hosts.map(h => <option key={h.id} value={h.id}>{h.displayName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Date *</label>
            <DatePicker value={date} onChange={setDate} placeholder="Pick a date…" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Hours (+add / -deduct)</label>
            <input type="number" value={hours} onChange={e => setHours(e.target.value)} step="0.5"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Reason *</label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Campaign bonus, manual correction…"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} disabled={!liveHostId || !reason}>Save Adjustment</Button>
        </div>
      </div>
    </Modal>
  );
}

function SetBalanceModal({ hosts, onClose, onDone }: {
  hosts: { id: string; displayName: string }[]; onClose: () => void; onDone: () => void;
}) {
  const [liveHostId, setLiveHostId] = useState("");
  const [targetUnits, setTargetUnits] = useState("1");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!liveHostId || !reason) return;
    setSaving(true);
    await fetch("/api/replacement-leave/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "SET_BALANCE", liveHostId, targetUnits: parseInt(targetUnits), reason }),
    });
    setSaving(false);
    onDone();
  }

  return (
    <Modal open onClose={onClose} title="Override RL Balance" size="lg">
      <div className="space-y-4">
        <div className="p-3 rounded-lg text-xs" style={{ background: "#6366f110", border: "1px solid #6366f130", color: "#6366f1" }}>
          <strong>Override:</strong> This sets a host's effective balance to a specific number of units by adding a manual hours adjustment. Use sparingly for corrections or migration from old system.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Host *</label>
            <select value={liveHostId} onChange={e => setLiveHostId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
              <option value="">Select host…</option>
              {hosts.map(h => <option key={h.id} value={h.id}>{h.displayName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Target Balance (units)</label>
            <input type="number" min="0" value={targetUnits} onChange={e => setTargetUnits(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Reason *</label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Migration from old system, correction…"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} disabled={!liveHostId || !reason}>Override Balance</Button>
        </div>
      </div>
    </Modal>
  );
}

function BlackoutModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!date || !reason) return;
    setSaving(true);
    const res = await fetch("/api/replacement-leave/blackout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, reason }),
    });
    setSaving(false);
    if (res.ok) { onDone(); }
    else { const d = await res.json(); setError(d.error ?? "Failed"); }
  }

  return (
    <Modal open onClose={onClose} title="Add Blackout Date">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Date *</label>
          <DatePicker value={date} onChange={setDate} placeholder="Pick a date…" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Reason *</label>
          <input type="text" value={reason} onChange={e => setReason(e.target.value)}
            placeholder="e.g. Year-end campaign, major product launch…"
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
        </div>
        {error && <div className="text-sm p-2 rounded-lg" style={{ background: "#ef444410", color: "#ef4444" }}>{error}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} disabled={!date || !reason}>Add Blackout</Button>
        </div>
      </div>
    </Modal>
  );
}

function BulkActionBar({ selectedIds, onAction, loading }: {
  selectedIds: string[]; onAction: (action: "APPROVE" | "REJECT", note: string) => void; loading: boolean;
}) {
  const [note, setNote] = useState("");
  if (selectedIds.length === 0) return null;
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--accent)40" }}>
      <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>{selectedIds.length} selected</span>
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional admin note…"
        className="flex-1 px-2 py-1.5 rounded-lg text-xs"
        style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
      <Button variant="destructive" onClick={() => onAction("REJECT", note)} loading={loading} className="text-xs py-1.5">
        <XCircle size={13} /> Reject All
      </Button>
      <Button onClick={() => onAction("APPROVE", note)} loading={loading} className="text-xs py-1.5">
        <CheckCircle2 size={13} /> Approve All
      </Button>
    </div>
  );
}

function AdminView() {
  const [data, setData] = useState<{ summaries: AdminHostSummary[]; pendingApps: PendingApp[]; recentApprovedApps: ReviewedApp[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [blackouts, setBlackouts] = useState<BlackoutDate[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [reviewApp, setReviewApp] = useState<PendingApp | null>(null);
  const [expandedHost, setExpandedHost] = useState<string | null>(null);
  const [addCreditOpen, setAddCreditOpen] = useState(false);
  const [setBalanceOpen, setSetBalanceOpen] = useState(false);
  const [blackoutOpen, setBlackoutOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showBlackouts, setShowBlackouts] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [adminRes, blackoutRes, auditRes] = await Promise.all([
      fetch("/api/replacement-leave/admin"),
      fetch("/api/replacement-leave/blackout"),
      fetch("/api/replacement-leave/audit"),
    ]);
    if (adminRes.ok) setData(await adminRes.json());
    if (blackoutRes.ok) setBlackouts((await blackoutRes.json()).blackouts ?? []);
    if (auditRes.ok) setAuditLogs((await auditRes.json()).logs ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleBulkAction(action: "APPROVE" | "REJECT", note: string) {
    setBulkLoading(true);
    await fetch("/api/replacement-leave/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds, action, adminNote: note }),
    });
    setBulkLoading(false);
    setSelectedIds([]);
    load();
  }

  const [syncing, setSyncing] = useState(false);
  async function syncCampaignBlackouts() {
    setSyncing(true);
    const res = await fetch("/api/campaigns", { method: "PATCH" });
    setSyncing(false);
    if (res.ok) load();
  }

  async function removeBlackout(id: string) {
    await fetch("/api/replacement-leave/blackout", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  async function handleExport() {
    setExporting(true);
    const res = await fetch("/api/replacement-leave/export");
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `replacement-leave-${mytToday()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setExporting(false);
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>
    </div>
  );

  const { summaries, pendingApps, recentApprovedApps } = data!;

  // Analytics
  const totalHosts = summaries.length;
  const hostsWithRL = summaries.filter(s => s.summary.unitsEarned > 0).length;
  const totalUnitsEarned = summaries.reduce((sum, s) => sum + s.summary.unitsEarned, 0);
  const totalUnitsUsed = summaries.reduce((sum, s) => sum + s.summary.unitsUsed, 0);
  const totalExpired = summaries.reduce((sum, s) => sum + s.summary.unitsExpired, 0);
  const approvedAppsWithTime = recentApprovedApps.filter(a => a.reviewedAt);
  const avgApprovalHrs = approvedAppsWithTime.length > 0
    ? approvedAppsWithTime.reduce((sum, a) => sum + (new Date(a.reviewedAt!).getTime() - new Date(a.createdAt).getTime()) / 3600000, 0) / approvedAppsWithTime.length
    : null;

  // Calendar apps (pending + approved/rejected from recent)
  const calendarApps: CalendarApp[] = [
    ...pendingApps.map(a => ({ id: a.id, liveHostId: a.liveHost.id, leaveDate: a.leaveDate, halfDay: a.halfDay, status: "PENDING", liveHost: { id: a.liveHost.id, displayName: a.liveHost.displayName } })),
    ...recentApprovedApps.filter(a => a.status === "APPROVED").map(a => ({ id: a.id, liveHostId: a.liveHost.id, leaveDate: a.leaveDate, halfDay: a.halfDay, status: "APPROVED", liveHost: { id: a.liveHost.id, displayName: a.liveHost.displayName } })),
  ];

  const ACTION_LABELS: Record<string, { label: string; color: string }> = {
    APPLY:            { label: "Applied",         color: "#6366f1" },
    APPROVE:          { label: "Approved",         color: "#22c55e" },
    REJECT:           { label: "Rejected",         color: "#ef4444" },
    CANCEL:           { label: "Cancelled",        color: "#94a3b8" },
    MANUAL_CREDIT:    { label: "Manual Credit",    color: "#f97316" },
    REMOVE_CREDIT:    { label: "Credit Removed",   color: "#ef4444" },
    BLACKOUT_ADD:     { label: "Blackout Added",   color: "#f59e0b" },
    BLACKOUT_REMOVE:  { label: "Blackout Removed", color: "#94a3b8" },
    BALANCE_OVERRIDE: { label: "Balance Override", color: "#8b5cf6" },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Host Leaves</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Manage replacement leave balances and applications
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleExport} loading={exporting}>
            <Download size={14} /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => setSetBalanceOpen(true)}>
            <Zap size={14} /> Set Balance
          </Button>
          <Button variant="outline" onClick={() => setAddCreditOpen(true)}>
            <Plus size={14} /> Manual Credit
          </Button>
        </div>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: Users,       label: "Hosts with RL",     value: `${hostsWithRL}/${totalHosts}`,        color: "#6366f1", hint: "Have earned RL" },
          { icon: Sparkles,    label: "Total Units Earned", value: totalUnitsEarned,                      color: "var(--accent)", hint: "Across all hosts" },
          { icon: CheckCircle2,label: "Total Used",         value: totalUnitsUsed,                        color: "#22c55e", hint: "Approved leaves" },
          { icon: BarChart3,   label: "Avg Approval Time",  value: avgApprovalHrs != null ? `${avgApprovalHrs.toFixed(1)}h` : "—", color: "#0ea5e9", hint: "Application to decision" },
        ].map(({ icon: Icon, label, value, color, hint }) => (
          <div key={label} className="section-card p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 mb-1">
              <Icon size={14} style={{ color }} />
              <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
            </div>
            <div className="text-2xl font-bold" style={{ color }}>{value}</div>
            <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</div>
          </div>
        ))}
      </div>
      {totalExpired > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: "#94a3b810", border: "1px solid #94a3b830", color: "#94a3b8" }}>
          <AlertCircle size={13} /> {totalExpired} RL unit(s) have expired without being used across all hosts.
        </div>
      )}

      {/* Leave Calendar */}
      <div className="section-card overflow-hidden">
        <button
          onClick={() => setShowCalendar(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
          style={{ borderBottom: showCalendar ? "1px solid var(--border)" : "none" }}>
          <div className="flex items-center gap-2">
            <Calendar size={14} style={{ color: "var(--accent)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Leave Calendar</span>
          </div>
          {showCalendar ? <ChevronUp size={14} style={{ color: "var(--text-muted)" }} /> : <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />}
        </button>
        {showCalendar && (
          <div className="p-4">
            <LeaveCalendar apps={calendarApps} />
          </div>
        )}
      </div>

      {/* Pending Approvals */}
      <div className="section-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertCircle size={14} style={{ color: pendingApps.length > 0 ? "#f59e0b" : "var(--text-muted)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Pending Approvals</span>
          {pendingApps.length > 0 && (
            <span className="ml-1 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold"
              style={{ background: "#f59e0b", color: "#000" }}>{pendingApps.length}</span>
          )}
          {pendingApps.length > 1 && (
            <button
              onClick={() => setSelectedIds(selectedIds.length === pendingApps.length ? [] : pendingApps.map(a => a.id))}
              className="ml-auto text-xs px-2 py-1 rounded cursor-pointer"
              style={{ color: "var(--accent)", background: "var(--accent)10" }}>
              {selectedIds.length === pendingApps.length ? "Deselect All" : "Select All"}
            </button>
          )}
        </div>

        <BulkActionBar selectedIds={selectedIds} onAction={handleBulkAction} loading={bulkLoading} />

        {pendingApps.length === 0 ? (
          <div className="flex items-center gap-2 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
            <CheckCircle2 size={16} />
            <span>No pending applications — all clear!</span>
          </div>
        ) : (
          <div className="space-y-2">
            {pendingApps.map(app => (
              <div key={app.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(app.id)}
                  onChange={e => setSelectedIds(prev => e.target.checked ? [...prev, app.id] : prev.filter(i => i !== app.id))}
                  className="flex-shrink-0"
                />
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: "var(--accent)20", color: "var(--accent)" }}>
                  {app.liveHost.displayName.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{app.liveHost.displayName}</span>
                    <span className="text-sm" style={{ color: "var(--text-secondary)" }}>→ {fmtDate(app.leaveDate)}</span>
                    <HalfDayPill halfDay={app.halfDay} />
                    <CategoryPill category={app.category} />
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Applied {format(new Date(app.createdAt), "d MMM yyyy")}
                    {app.notes && <> · "{app.notes}"</>}
                  </div>
                </div>
                <button
                  onClick={() => setReviewApp(app)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                  style={{ background: "var(--accent)", color: "#fff" }}>
                  Review
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Blackout Dates */}
      <div className="section-card overflow-hidden">
        <div
          className="w-full flex items-center justify-between px-4 py-3"
          style={{ borderBottom: showBlackouts ? "1px solid var(--border)" : "none" }}>
          <div className="flex items-center gap-2 flex-1 cursor-pointer" onClick={() => setShowBlackouts(v => !v)}>
            <Ban size={14} style={{ color: "#ef4444" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Blackout Dates</span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {blackouts.length > 0 ? `${blackouts.length} active` : "None set"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={syncCampaignBlackouts}
              disabled={syncing}
              className="text-xs px-3 py-1.5 rounded-lg cursor-pointer font-medium"
              style={{ background: "rgba(99,102,241,0.18)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.3)", opacity: syncing ? 0.6 : 1 }}>
              {syncing ? "Syncing…" : "↻ Sync Campaigns"}
            </button>
            <button onClick={() => setBlackoutOpen(true)}
              className="text-xs px-3 py-1.5 rounded-lg cursor-pointer font-medium"
              style={{ background: "var(--accent-light)", color: "var(--accent)", border: "1px solid rgba(22,119,255,0.3)" }}>
              + Add
            </button>
            <div className="cursor-pointer" onClick={() => setShowBlackouts(v => !v)}>
              {showBlackouts ? <ChevronUp size={14} style={{ color: "var(--text-muted)" }} /> : <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />}
            </div>
          </div>
        </div>
        {showBlackouts && (
          <div className="p-4 space-y-2">
            {blackouts.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>
                No blackout dates. Add dates when leave applications should be blocked (e.g. major campaigns).
              </p>
            ) : (
              blackouts.map(b => (
                <div key={b.id} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                  style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
                  <Ban size={12} style={{ color: "#ef4444", flexShrink: 0 }} />
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{fmtDate(b.date)}</span>
                  <span className="flex-1 text-xs truncate" style={{ color: "var(--text-secondary)" }}>{b.reason}</span>
                  <button onClick={() => removeBlackout(b.id)}
                    className="text-xs px-2 py-1 rounded cursor-pointer flex-shrink-0"
                    style={{ color: "#ef4444", background: "#ef444415" }}>
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Public Holidays */}
      <PublicHolidaySection />

      {/* All Hosts RL Balance */}
      <div className="section-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <Users size={14} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>All Hosts — RL Balance & Forecast</span>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {summaries.map(({ host, summary: s }) => (
            <div key={host.id}>
              <button
                onClick={() => setExpandedHost(expandedHost === host.id ? null : host.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
                style={{ background: expandedHost === host.id ? "var(--bg-subtle)" : "transparent" }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: "var(--accent)20", color: "var(--accent)" }}>
                  {host.displayName.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{host.displayName}</span>
                  {s.unitsEarned > 0 && (
                    <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                      Next unit in {s.hoursToNextUnit.toFixed(1)}h · {s.totalHours.toFixed(1)}h accumulated
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {s.unitsAvailable > 0 && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                      style={{ background: "#22c55e20", color: "#22c55e" }}>
                      <CircleCheck size={10} /> {s.unitsAvailable} avail.
                    </div>
                  )}
                  {s.unitsPendingApproval > 0 && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                      style={{ background: "#6366f120", color: "#6366f1" }}>
                      <Clock size={10} /> {s.unitsPendingApproval} pending
                    </div>
                  )}
                  {s.unitsEarned === 0 && (
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>No RL earned</span>
                  )}
                </div>
                {expandedHost === host.id
                  ? <ChevronUp size={14} style={{ color: "var(--text-muted)" }} />
                  : <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />}
              </button>

              {expandedHost === host.id && (
                <div className="px-4 pb-4 space-y-3" style={{ background: "var(--bg-subtle)" }}>
                  <div className="grid grid-cols-4 gap-2 pt-2">
                    {[
                      { label: "Available", value: s.unitsAvailable,      color: "#22c55e" },
                      { label: "Pending",   value: s.unitsPendingApproval, color: "#6366f1" },
                      { label: "Used",      value: s.unitsUsed,            color: "var(--text-muted)" },
                      { label: "Expired",   value: s.unitsExpired,         color: "#94a3b8" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="text-center p-2 rounded-lg" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                        <div className="text-lg font-bold" style={{ color }}>{value}</div>
                        <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{label}</div>
                      </div>
                    ))}
                  </div>
                  {s.contributions.length > 0 ? (
                    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                      <div className="grid grid-cols-[80px_80px_1fr_50px_60px] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ background: "var(--panel-header-bg)", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
                        <div>Date</div><div>Type</div><div>Description</div><div className="text-right">Hours</div><div className="text-right">∑ Total</div>
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y" style={{ borderColor: "var(--border)" }}>
                        {s.contributions.map((c, i) => (
                          <div key={i} className="grid grid-cols-[80px_80px_1fr_50px_60px] px-3 py-1.5 items-center">
                            <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{c.date.slice(5)}</div>
                            <ReasonPill reason={c.reason} />
                            <div className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>{c.description}</div>
                            <div className="text-[11px] text-right font-medium" style={{ color: c.hours >= 0 ? "#22c55e" : "#ef4444" }}>
                              {c.hours >= 0 ? "+" : ""}{c.hours.toFixed(1)}h
                            </div>
                            <div className="text-[11px] text-right" style={{ color: "var(--text-muted)" }}>{c.runningTotal.toFixed(1)}h</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-center py-2" style={{ color: "var(--text-muted)" }}>No RL contributions yet.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Audit Log */}
      <div className="section-card overflow-hidden">
        <button
          onClick={() => setShowAudit(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
          style={{ borderBottom: showAudit ? "1px solid var(--border)" : "none" }}>
          <div className="flex items-center gap-2">
            <History size={14} style={{ color: "var(--accent)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Audit Log</span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{auditLogs.length} entries</span>
          </div>
          {showAudit ? <ChevronUp size={14} style={{ color: "var(--text-muted)" }} /> : <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />}
        </button>
        {showAudit && (
          <div className="divide-y max-h-96 overflow-y-auto" style={{ borderColor: "var(--border)" }}>
            {auditLogs.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>No audit entries yet.</p>
            ) : (
              auditLogs.map(log => {
                const meta = ACTION_LABELS[log.action] ?? { label: log.action, color: "var(--text-muted)" };
                return (
                  <div key={log.id} className="flex items-start gap-3 px-4 py-2.5">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 mt-0.5"
                      style={{ background: meta.color + "20", color: meta.color }}>{meta.label}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        {log.hostName && <span className="font-medium">{log.hostName} — </span>}
                        {log.detail}
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {log.performerName} · {format(new Date(log.createdAt), "d MMM yyyy, HH:mm")}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {reviewApp && (
        <ApproveModal
          app={reviewApp}
          onClose={() => setReviewApp(null)}
          onDone={() => { setReviewApp(null); load(); }}
        />
      )}
      {addCreditOpen && (
        <AddCreditModal
          hosts={summaries.map(s => ({ id: s.host.id, displayName: s.host.displayName }))}
          onClose={() => setAddCreditOpen(false)}
          onDone={() => { setAddCreditOpen(false); load(); }}
        />
      )}
      {setBalanceOpen && (
        <SetBalanceModal
          hosts={summaries.map(s => ({ id: s.host.id, displayName: s.host.displayName }))}
          onClose={() => setSetBalanceOpen(false)}
          onDone={() => { setSetBalanceOpen(false); load(); }}
        />
      )}
      {blackoutOpen && (
        <BlackoutModal
          onClose={() => setBlackoutOpen(false)}
          onDone={() => { setBlackoutOpen(false); load(); }}
        />
      )}
    </div>
  );
}

// ── Page entry ────────────────────────────────────────────────────────────────

export default function LeavePage() {
  const { data: authSession } = useSession();
  const role = (authSession?.user as { role?: string })?.role;
  if (!role) return null;
  if (role === "ADMIN") return <AdminView />;
  if (role === "LIVE_HOST") return <HostView />;
  return <div className="p-8 text-center" style={{ color: "var(--text-muted)" }}>This page is not available for your role.</div>;
}
