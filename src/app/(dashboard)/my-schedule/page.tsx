"use client";
import React, { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { Download, CalendarPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PlatformBadge } from "@/components/ui/platform-badge";
import { formatCurrency } from "@/lib/utils";
import {
  Session, DailyGridView, DailyListView, ScheduleViewToggle,
} from "@/components/schedule/schedule-views";

export default function MySchedulePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [detail, setDetail] = useState<Session | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "dailyList">("grid");
  const [gridDate, setGridDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  function getGridRange(dateStr: string) {
    const d = parseISO(dateStr);
    return {
      start: format(new Date(d.getFullYear(), d.getMonth(), 1), "yyyy-MM-dd") + "T00:00:00+08:00",
      end: format(new Date(d.getFullYear(), d.getMonth() + 1, 0), "yyyy-MM-dd") + "T23:59:59+08:00",
    };
  }

  const load = useCallback(async (dateStr: string) => {
    const { start, end } = getGridRange(dateStr);
    const res = await fetch(`/api/sessions?start=${start}&end=${end}`);
    setSessions(await res.json());
  }, []);

  useEffect(() => { load(gridDate); }, [gridDate, load]);

  async function addToCalendar(s: Session) {
    const start = new Date(s.scheduledStart);
    const end = new Date(s.scheduledEnd);
    const title = encodeURIComponent(`${s.brand.name} Livestream`);
    const details = encodeURIComponent(`Platform: ${s.platform}${s.room ? `\nRoom: ${s.room.name}` : ""}`);
    const startStr = start.toISOString().replace(/-|:|\.\d{3}/g, "");
    const endStr = end.toISOString().replace(/-|:|\.\d{3}/g, "");
    window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${details}`, "_blank");
  }

  async function exportICS() {
    const { start, end } = getGridRange(gridDate);
    const res = await fetch(`/api/export/ics?start=${start}&end=${end}`);
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
        <div className="flex items-center gap-2">
          <ScheduleViewToggle viewMode={viewMode} setViewMode={setViewMode} />
          <Button variant="outline" onClick={exportICS}><Download size={14} /> Export .ics</Button>
        </div>
      </div>

      {viewMode === "grid" ? (
        <DailyGridView
          sessions={sessions}
          rooms={[]}
          hosts={[]}
          gridDate={gridDate}
          setGridDate={setGridDate}
          onSessionClick={setDetail}
        />
      ) : (
        <DailyListView
          sessions={sessions}
          gridDate={gridDate}
          setGridDate={setGridDate}
          onSessionClick={setDetail}
        />
      )}

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
              {detail.room && <InfoRow label="Room" value={detail.room.name} />}
              <InfoRow label="Platform" value={<PlatformBadge platform={detail.platform} showName size="sm" />} />
              <InfoRow label="Scheduled" value={`${format(new Date(detail.scheduledStart), "dd MMM yyyy")} ${format(new Date(detail.scheduledStart), "HH:mm")} – ${format(new Date(detail.scheduledEnd), "HH:mm")}`} />
              {detail.actualStart && <InfoRow label="Actual Start" value={format(new Date(detail.actualStart), "HH:mm")} />}
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
