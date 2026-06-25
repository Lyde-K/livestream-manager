"use client";
import { useState, useEffect, useCallback } from "react";
import { parseISO, format } from "date-fns";
import { ChevronLeft, ChevronRight, Clapperboard, RefreshCw } from "lucide-react";
import { formatMYT, mytDateStr } from "@/lib/myt";
import { sessionOverlapsSlot, TIME_SLOTS } from "@/components/schedule/schedule-views";

interface StudioSession {
  id: string;
  scheduledStart: string;
  scheduledEnd: string;
  platform: string;
  status: string;
  isCampaignDay: boolean;
  brand: { id: string; name: string; color: string };
  liveHost: { id: string; displayName: string } | null;
  room: { id: string; name: string } | null;
}

const PLATFORM_DOT: Record<string, string> = {
  TIKTOK: "#f472b6",
  SHOPEE: "#f97316",
  BOTH:   "#a78bfa",
};

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  COMPLETED:  { bg: "rgba(34,197,94,0.10)",  color: "#22c55e" },
  MISSED:     { bg: "rgba(239,68,68,0.10)",   color: "#ef4444" },
  PENDING:    { bg: "rgba(148,163,184,0.08)", color: "#94a3b8" },
};

function todayMYT() {
  return mytDateStr(new Date());
}

function shiftDay(dateStr: string, delta: number) {
  const d = parseISO(dateStr);
  d.setDate(d.getDate() + delta);
  return format(d, "yyyy-MM-dd");
}

export default function StudioSchedulePage() {
  const [date, setDate]       = useState(todayMYT);
  const [sessions, setSessions] = useState<StudioSession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    const res = await fetch(`/api/studio-schedule?date=${d}`);
    const data = await res.json();
    setSessions(data.sessions ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  // Group by host displayName, sorted alphabetically
  const byHost = sessions.reduce<Record<string, StudioSession[]>>((acc, s) => {
    const name = s.liveHost?.displayName ?? "Unassigned";
    (acc[name] ??= []).push(s);
    return acc;
  }, {});

  function countSlots(hostSessions: StudioSession[]) {
    return hostSessions.reduce((total, s) =>
      total + TIME_SLOTS.filter(slot => sessionOverlapsSlot(s as Parameters<typeof sessionOverlapsSlot>[0], slot)).length
    , 0);
  }

  const hostNames = Object.keys(byHost).sort((a, b) => {
    if (a === "Unassigned") return 1;
    if (b === "Unassigned") return -1;
    return a.localeCompare(b);
  });

  const displayDate = parseISO(date);
  const dayLabel = format(displayDate, "EEEE, d MMMM yyyy");
  const isToday = date === todayMYT();

  return (
    <div className="space-y-5 animate-in max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(249,115,22,0.12)" }}>
            <Clapperboard size={16} style={{ color: "#f97316" }} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Studio Schedule</h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Daily host lineup — read only
            </p>
          </div>
        </div>
      </div>

      {/* Day navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setDate(d => shiftDay(d, -1))}
          className="p-2 rounded-lg transition-colors"
          style={{ color: "var(--text-secondary)", background: "var(--bg-subtle)", border: "1px solid var(--border)" }}
        >
          <ChevronLeft size={16} />
        </button>

        <div className="flex-1 text-center">
          <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{dayLabel}</span>
          {isToday && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: "rgba(249,115,22,0.15)", color: "#f97316" }}>
              TODAY
            </span>
          )}
        </div>

        <button
          onClick={() => setDate(d => shiftDay(d, 1))}
          className="p-2 rounded-lg transition-colors"
          style={{ color: "var(--text-secondary)", background: "var(--bg-subtle)", border: "1px solid var(--border)" }}
        >
          <ChevronRight size={16} />
        </button>

        {!isToday && (
          <button
            onClick={() => setDate(todayMYT())}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{ color: "#f97316", background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)" }}
          >
            Today
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="section-card p-12 text-center" style={{ color: "var(--text-muted)" }}>
          <RefreshCw size={18} className="mx-auto mb-2 animate-spin" />
          Loading schedule…
        </div>
      ) : sessions.length === 0 ? (
        <div className="section-card p-12 text-center">
          <Clapperboard size={28} className="mx-auto mb-3 opacity-30" style={{ color: "var(--text-muted)" }} />
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>No sessions scheduled</p>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Nothing on the studio calendar for this day.</p>
        </div>
      ) : (
        <div className="section-card overflow-hidden">
          <div className="section-card-header">
            <h2 className="flex items-center gap-2">
              <Clapperboard size={13} style={{ color: "#f97316" }} />
              {hostNames.filter(h => h !== "Unassigned").length} host{hostNames.filter(h => h !== "Unassigned").length !== 1 ? "s" : ""} — {sessions.reduce((t, s) => t + TIME_SLOTS.filter(slot => sessionOverlapsSlot(s as Parameters<typeof sessionOverlapsSlot>[0], slot)).length, 0)} slots
            </h2>
          </div>

          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {hostNames.map(hostName => (
              <div key={hostName} className="px-4 py-4">
                {/* Host row header */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                    style={{ background: "linear-gradient(135deg,#f97316 0%,#ffc21a 100%)", color: "#0A1424" }}>
                    {hostName.charAt(0)}
                  </div>
                  <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{hostName}</span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    · {countSlots(byHost[hostName])} slot{countSlots(byHost[hostName]) !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Sessions for this host */}
                <div className="flex flex-wrap gap-2 pl-9">
                  {byHost[hostName]
                    .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime())
                    .map(s => {
                      const statusStyle = STATUS_STYLE[s.status] ?? STATUS_STYLE.PENDING;
                      return (
                        <div key={s.id}
                          className="rounded-xl px-3 py-2.5 flex flex-col gap-1 min-w-[140px]"
                          style={{ background: "var(--bg-subtle)", border: `1px solid ${s.brand.color}30` }}>
                          {/* Brand */}
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: s.brand.color }} />
                            <span className="font-semibold text-xs truncate" style={{ color: "var(--text-primary)" }}>
                              {s.brand.name}
                            </span>
                          </div>
                          {/* Time */}
                          <div className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                            {formatMYT(s.scheduledStart, "HH:mm")} – {formatMYT(s.scheduledEnd, "HH:mm")}
                          </div>
                          {/* Room + platform */}
                          <div className="flex items-center gap-2">
                            {s.room && (
                              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{s.room.name}</span>
                            )}
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ background: PLATFORM_DOT[s.platform] ?? "#94a3b8" }} />
                            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{s.platform}</span>
                            {s.isCampaignDay && (
                              <span className="text-[9px] px-1 rounded font-bold"
                                style={{ background: "rgba(168,85,247,0.12)", color: "#a855f7" }}>
                                CAMP
                              </span>
                            )}
                          </div>
                          {/* Status */}
                          <span className="self-start text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                            style={statusStyle}>
                            {s.status}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
