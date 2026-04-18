"use client";
import React, { useRef, useCallback } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PlatformBadge } from "@/components/ui/platform-badge";
import { Download, CalendarPlus } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";

interface Session {
  id: string; platform: string; scheduledStart: string; scheduledEnd: string;
  isCampaignDay: boolean; status: string; punctuality: string | null; gmv: number | null;
  actualStart: string | null; notes: string | null;
  room: { name: string }; brand: { name: string; color: string };
  liveHost: { user: { name: string } };
}

const PUNCT_COLORS: Record<string, string> = { EARLY: "#6366f1", ON_TIME: "#22c55e", LATE: "#f59e0b" };

export default function MySchedulePage() {
  const calRef = useRef<FullCalendar>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [detail, setDetail] = useState<Session | null>(null);
  const [viewRange, setViewRange] = useState({ start: "", end: "" });

  async function load(start: string, end: string) {
    const res = await fetch(`/api/sessions?start=${start}&end=${end}`);
    setSessions(await res.json());
  }

  const handleDatesSet = useCallback((arg: { startStr: string; endStr: string }) => {
    setViewRange({ start: arg.startStr, end: arg.endStr });
  }, []);

  useEffect(() => { if (viewRange.start) load(viewRange.start, viewRange.end); }, [viewRange]);

  const calEvents = sessions.map((s) => {
    const bg = s.status === "COMPLETED"
      ? (s.punctuality ? PUNCT_COLORS[s.punctuality] ?? "#22c55e" : "#22c55e")
      : s.status === "MISSED" ? "#ef4444" : s.brand.color;
    return { id: s.id, title: s.brand.name, start: s.scheduledStart, end: s.scheduledEnd, backgroundColor: bg, borderColor: bg, extendedProps: { session: s } };
  });

  async function addToCalendar(s: Session) {
    const start = new Date(s.scheduledStart);
    const end = new Date(s.scheduledEnd);
    const title = encodeURIComponent(`${s.brand.name} Livestream`);
    const details = encodeURIComponent(`Platform: ${s.platform}\nRoom: ${s.room.name}`);
    const startStr = start.toISOString().replace(/-|:|\.\d{3}/g, "");
    const endStr = end.toISOString().replace(/-|:|\.\d{3}/g, "");
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${details}`;
    window.open(url, "_blank");
  }

  async function exportICS() {
    const res = await fetch(`/api/export/ics?start=${viewRange.start}&end=${viewRange.end}`);
    if (!res.ok) return alert("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "my-schedule.ics"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>My Schedule</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Your assigned livestream sessions</p>
        </div>
        <Button variant="outline" onClick={exportICS}><Download size={14} /> Export .ics</Button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs flex-wrap" style={{ color: "var(--text-muted)" }}>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "var(--border)" }} />Scheduled
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" />Early
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />On Time
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />Late
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />Missed
        </span>
      </div>

      <div className="section-card p-4">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek" }}
          buttonText={{ month: "Month", week: "Week", day: "Day", list: "List" }}
          height="calc(100vh - 280px)"
          events={calEvents}
          slotMinTime="06:00:00" slotMaxTime="02:00:00" scrollTime="08:00:00"
          allDaySlot={false} nowIndicator
          datesSet={handleDatesSet}
          eventClick={(arg) => setDetail(arg.event.extendedProps.session)}
          eventContent={(arg) => {
            const s: Session = arg.event.extendedProps.session;
            return (
              <div className="px-1 py-0.5 leading-tight">
                <div className="font-semibold truncate text-xs">{s.brand.name}</div>
                <div className="opacity-75 truncate text-[10px] flex items-center gap-1">{s.room.name} · <PlatformBadge platform={s.platform} showName={false} size="xs" /></div>
              </div>
            );
          }}
        />
      </div>

      {detail && (
        <Modal open={!!detail} onClose={() => setDetail(null)} title="Session Details">
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-3 h-3 rounded-full" style={{ background: detail.brand.color }} />
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{detail.brand.name}</span>
              <PunctualityBadge status={detail.status} punctuality={detail.punctuality} />
              {detail.isCampaignDay && <Badge variant="warning">Campaign Day</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <InfoRow label="Room" value={detail.room.name} />
              <InfoRow label="Platform" value={<PlatformBadge platform={detail.platform} showName size="sm" />} />
              <InfoRow label="Scheduled" value={`${format(new Date(detail.scheduledStart), "dd MMM yyyy")} ${format(new Date(detail.scheduledStart), "HH:mm")} – ${format(new Date(detail.scheduledEnd), "HH:mm")}`} />
              {detail.actualStart && <InfoRow label="Actual Start" value={format(new Date(detail.actualStart), "HH:mm")} />}
              {detail.gmv !== null && <InfoRow label="GMV" value={formatCurrency(detail.gmv ?? 0)} />}
            </div>
            {detail.notes && (
              <div
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
              >
                {detail.notes}
              </div>
            )}
            <div
              className="flex justify-between pt-2"
              style={{ borderTop: "1px solid var(--border)" }}
            >
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

function InfoRow({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div>
      <div className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="font-medium" style={{ color: "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

function PunctualityBadge({ status, punctuality }: { status: string; punctuality: string | null }) {
  if (status === "PENDING") return <Badge variant="secondary">Upcoming</Badge>;
  if (status === "MISSED") return <Badge variant="destructive">Missed</Badge>;
  if (punctuality === "EARLY") return <Badge variant="default">Early ✓</Badge>;
  if (punctuality === "ON_TIME") return <Badge variant="success">On Time ✓</Badge>;
  if (punctuality === "LATE") return <Badge variant="warning">Late</Badge>;
  return <Badge variant="success">Done</Badge>;
}
