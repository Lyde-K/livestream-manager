"use client";
import { useRef, useCallback, useState, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Download, FileSpreadsheet, Clock, Layers } from "lucide-react";
import { format } from "date-fns";

interface Session {
  id: string; platform: string; scheduledStart: string; scheduledEnd: string;
  notes: string | null; status: string;
  room: { name: string }; brand: { name: string; color: string };
  liveHost: { user: { name: string } };
}

interface Brand { id: string; name: string; color: string; }

// Month options — current month ± 12 months
function buildMonthOptions() {
  const opts: { label: string; value: string }[] = [];
  const now = new Date();
  for (let i = -6; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    opts.push({
      label: format(d, "MMMM yyyy"),
      value: format(d, "yyyy-MM"),
    });
  }
  return opts;
}

const MONTH_OPTIONS = buildMonthOptions();
const CURRENT_MONTH = format(new Date(), "yyyy-MM");

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ExportModal({ onClose }: { onClose: () => void }) {
  const [brands, setBrands]         = useState<Brand[]>([]);
  const [brandId, setBrandId]       = useState("");
  const [month, setMonth]           = useState(CURRENT_MONTH);
  const [preview, setPreview]       = useState<{ sessions: number; hours: number; estimatedBytes: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [exporting, setExporting]   = useState(false);

  // Load brands on mount
  useEffect(() => {
    fetch("/api/brands")
      .then(r => r.json())
      .then((data: Brand[]) => {
        setBrands(data);
        if (data.length === 1) setBrandId(data[0].id);
      });
  }, []);

  // Fetch preview whenever brand or month changes
  useEffect(() => {
    if (!brandId || !month) { setPreview(null); return; }
    setPreviewing(true);
    setPreview(null);
    fetch(`/api/export/client-schedule/preview?brandId=${brandId}&month=${month}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setPreview(d); setPreviewing(false); })
      .catch(() => setPreviewing(false));
  }, [brandId, month]);

  async function doExport() {
    if (!brandId || !month) return;
    setExporting(true);
    const [year, mo] = month.split("-").map(Number);
    // MYT month boundaries
    const startMYT = new Date(Date.UTC(year, mo - 1, 1, -8, 0, 0));
    const endMYT   = new Date(Date.UTC(year, mo,     1, -8, 0, 0));
    const params   = new URLSearchParams({
      brandId,
      start: startMYT.toISOString(),
      end:   endMYT.toISOString(),
    });
    const res = await fetch(`/api/export/client-schedule?${params}`);
    setExporting(false);
    if (!res.ok) { alert("Export failed. Please try again."); return; }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const brandName = brands.find(b => b.id === brandId)?.name ?? "brand";
    const monthLabel = MONTH_OPTIONS.find(m => m.value === month)?.label ?? month;
    a.href = url;
    a.download = `schedule-${brandName}-${monthLabel}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  }

  const selectedBrand = brands.find(b => b.id === brandId);

  return (
    <Modal open onClose={onClose} title="Export Schedule" size="md">
      <div className="space-y-5">

        {/* Brand selector */}
        <div>
          <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Brand
          </label>
          <select
            value={brandId}
            onChange={e => setBrandId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg text-sm"
            style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "inherit" }}
          >
            <option value="">Select brand…</option>
            {brands.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* Month selector */}
        <div>
          <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Month
          </label>
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg text-sm"
            style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "inherit" }}
          >
            {MONTH_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Preview panel */}
        <div style={{
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--bg-subtle)",
          overflow: "hidden",
          minHeight: 90,
        }}>
          {!brandId ? (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              Select a brand to see export details
            </div>
          ) : previewing ? (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              Calculating…
            </div>
          ) : preview ? (
            <div style={{ padding: "16px 20px" }}>
              {selectedBrand && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: selectedBrand.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{selectedBrand.name}</span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>·</span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{MONTH_OPTIONS.find(m => m.value === month)?.label}</span>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {[
                  { icon: Layers, label: "Sessions",  value: preview.sessions.toString(),         color: "#6366f1" },
                  { icon: Clock,  label: "Hours",     value: `${preview.hours}h`,                color: "#F97316" },
                  { icon: FileSpreadsheet, label: "Est. Size", value: formatBytes(preview.estimatedBytes), color: "#22c55e" },
                ].map(({ icon: Icon, label, value, color }) => (
                  <div key={label} style={{
                    borderRadius: 10,
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    padding: "12px 10px",
                    textAlign: "center",
                  }}>
                    <Icon size={16} style={{ color, margin: "0 auto 6px" }} />
                    <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>{value}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                  </div>
                ))}
              </div>
              {preview.sessions === 0 && (
                <p style={{ margin: "12px 0 0", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
                  No sessions found for this brand and month.
                </p>
              )}
            </div>
          ) : (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              Could not load preview.
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={doExport}
            disabled={!brandId || !month || exporting || (preview?.sessions === 0)}
            loading={exporting}
          >
            <Download size={14} />
            {exporting ? "Exporting…" : "Export"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function ClientBrandPage() {
  const calRef = useRef<FullCalendar>(null);
  const [sessions, setSessions]       = useState<Session[]>([]);
  const [detail, setDetail]           = useState<Session | null>(null);
  const [viewRange, setViewRange]     = useState({ start: "", end: "" });
  const [exportOpen, setExportOpen]   = useState(false);

  const handleDatesSet = useCallback((arg: { startStr: string; endStr: string }) => {
    setViewRange({ start: arg.startStr, end: arg.endStr });
  }, []);

  useEffect(() => {
    if (viewRange.start) {
      fetch(`/api/sessions?start=${viewRange.start}&end=${viewRange.end}`)
        .then((r) => r.json()).then(setSessions);
    }
  }, [viewRange]);

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
        <Button variant="outline" onClick={() => setExportOpen(true)}>
          <Download size={14} /> Export Schedule
        </Button>
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

      {exportOpen && <ExportModal onClose={() => setExportOpen(false)} />}

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
            <div className="flex justify-end pt-2" style={{ borderTop: "1px solid var(--border)" }}>
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
