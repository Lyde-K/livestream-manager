"use client";
import { useRef, useCallback, useState, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Download } from "lucide-react";
import { format } from "date-fns";

interface Session {
  id: string; platform: string; scheduledStart: string; scheduledEnd: string;
  notes: string | null; status: string;
  room: { name: string }; brand: { name: string; color: string };
  liveHost: { user: { name: string } };
}

export default function ClientBrandPage() {
  const calRef = useRef<FullCalendar>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [detail, setDetail] = useState<Session | null>(null);
  const [viewRange, setViewRange] = useState({ start: "", end: "" });

  const handleDatesSet = useCallback((arg: { startStr: string; endStr: string }) => {
    setViewRange({ start: arg.startStr, end: arg.endStr });
  }, []);

  useEffect(() => {
    if (viewRange.start) {
      fetch(`/api/sessions?start=${viewRange.start}&end=${viewRange.end}`)
        .then((r) => r.json()).then(setSessions);
    }
  }, [viewRange]);

  async function exportExcel() {
    const cal = calRef.current;
    if (!cal) return;
    const view = cal.getApi().view;
    const start = view.activeStart.toISOString();
    const end = view.activeEnd.toISOString();
    const res = await fetch(`/api/export/client-schedule?start=${start}&end=${end}`);
    if (!res.ok) return alert("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const month = format(view.activeStart, "yyyy-MM");
    a.href = url; a.download = `schedule-${month}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  }

  const calEvents = sessions.map((s) => ({
    id: s.id,
    title: `${s.liveHost.user.name}`,
    start: s.scheduledStart,
    end: s.scheduledEnd,
    backgroundColor: s.brand.color,
    borderColor: s.brand.color,
    extendedProps: { session: s },
  }));

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Brand Schedule</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Your brand&apos;s upcoming and past livestream sessions
          </p>
        </div>
        <Button variant="outline" onClick={exportExcel}><Download size={14} /> Export Schedule</Button>
      </div>

      <div className="section-card p-4">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,listWeek" }}
          buttonText={{ month: "Month", week: "Week", list: "List" }}
          height="calc(100vh - 250px)"
          events={calEvents}
          allDaySlot={false} nowIndicator
          slotMinTime="06:00:00" slotMaxTime="02:00:00" scrollTime="08:00:00"
          datesSet={handleDatesSet}
          eventClick={(arg) => setDetail(arg.event.extendedProps.session)}
          eventContent={(arg) => {
            const s: Session = arg.event.extendedProps.session;
            return (
              <div className="px-1 py-0.5 leading-tight">
                <div className="font-semibold truncate text-xs">{s.liveHost.user.name}</div>
                <div className="opacity-75 truncate text-[10px]">{s.platform}</div>
              </div>
            );
          }}
        />
      </div>

      {detail && (
        <Modal open={!!detail} onClose={() => setDetail(null)} title="Session Details">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: detail.brand.color }} />
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{detail.brand.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow label="Host" value={detail.liveHost.user.name} />
              <InfoRow label="Platform" value={detail.platform} />
              <InfoRow label="Date" value={format(new Date(detail.scheduledStart), "dd MMM yyyy")} />
              <InfoRow label="Time" value={`${format(new Date(detail.scheduledStart), "HH:mm")} – ${format(new Date(detail.scheduledEnd), "HH:mm")}`} />
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
              className="flex justify-end pt-2"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <Button variant="secondary" size="sm" onClick={() => setDetail(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="font-medium" style={{ color: "var(--text-primary)" }}>{value}</div>
    </div>
  );
}
