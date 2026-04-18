"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Plus, Filter, Mail, Sparkles, ChevronDown, ChevronUp, CalendarPlus, Wand2 } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import type { EventClickArg, DateSelectArg, EventDropArg } from "@fullcalendar/core";

interface Suggestion {
  date: string; dayOfWeek: string; hostId: string; hostName: string;
  displayName: string; suggestedSlot: string; preferredBrandIds: string[];
  hasExistingSession: boolean; isOffDay: boolean;
}
interface SuggestResult {
  suggestions: Suggestion[]; conflicts: Suggestion[]; offDays: Suggestion[];
  stats: { available: number; conflicts: number; offDays: number; hosts: number };
  month: number; year: number;
}

interface Room { id: string; name: string; }
interface Host { id: string; displayName: string; user: { name: string }; }
interface Brand { id: string; name: string; color: string; platform: string; }
interface Session {
  id: string; roomId: string; liveHostId: string; brandId: string; platform: string;
  scheduledStart: string; scheduledEnd: string; isCampaignDay: boolean; notes: string | null;
  status: string; punctuality: string | null; gmv: number | null; actualStart: string | null;
  room: Room; brand: Brand; liveHost: { user: { name: string }; displayName: string };
}

const PUNCTUALITY_COLORS: Record<string, string> = {
  EARLY: "#6366f1", ON_TIME: "#22c55e", LATE: "#f59e0b", default: "#94a3b8",
};

export default function SchedulePage() {
  const calRef = useRef<FullCalendar>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [filterHost, setFilterHost] = useState("");
  const [filterBrand, setFilterBrand] = useState("");
  const [filterRoom, setFilterRoom] = useState("");
  const [viewRange, setViewRange] = useState({ start: "", end: "" });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Session | null>(null);
  const [detailSession, setDetailSession] = useState<Session | null>(null);
  const [form, setForm] = useState({
    roomId: "", liveHostId: "", brandId: "", platform: "TIKTOK",
    scheduledStart: "", scheduledEnd: "", isCampaignDay: false, notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestResult, setSuggestResult] = useState<SuggestResult | null>(null);
  const [suggestFilter, setSuggestFilter] = useState("");

  async function loadMeta() {
    const [r, h, b] = await Promise.all([fetch("/api/rooms"), fetch("/api/hosts"), fetch("/api/brands")]);
    setRooms(await r.json());
    setHosts(await h.json());
    setBrands(await b.json());
  }

  async function loadSessions(start: string, end: string) {
    const params = new URLSearchParams({ start, end });
    if (filterHost) params.set("hostId", filterHost);
    if (filterBrand) params.set("brandId", filterBrand);
    const res = await fetch(`/api/sessions?${params}`);
    setSessions(await res.json());
  }

  useEffect(() => { loadMeta(); }, []);

  useEffect(() => {
    if (viewRange.start) loadSessions(viewRange.start, viewRange.end);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRange, filterHost, filterBrand]);

  const calEvents = sessions
    .filter((s) => !filterRoom || s.roomId === filterRoom)
    .map((s) => {
      const bgColor = s.status === "COMPLETED"
        ? (s.punctuality ? PUNCTUALITY_COLORS[s.punctuality] : PUNCTUALITY_COLORS.default)
        : s.status === "MISSED" ? "#ef4444"
        : s.brand.color;
      const durationMs = new Date(s.scheduledEnd).getTime() - new Date(s.scheduledStart).getTime();
      const durationHours = Math.round((durationMs / 3600000) * 10) / 10;
      const durationLabel = durationHours % 1 === 0 ? `${durationHours}h` : `${durationHours}h`;
      return {
        id: s.id,
        title: `${s.liveHost.user.name} · ${durationLabel}`,
        start: s.scheduledStart,
        end: s.scheduledEnd,
        backgroundColor: bgColor,
        borderColor: bgColor,
        extendedProps: { session: s },
      };
    });

  function handleDateSelect(arg: DateSelectArg) {
    const startStr = arg.startStr.includes("T") ? arg.startStr : `${arg.startStr}T10:00`;
    const endStr = arg.endStr.includes("T") ? arg.endStr : `${arg.startStr}T14:00`;
    setEditing(null);
    setForm({ roomId: "", liveHostId: "", brandId: "", platform: "TIKTOK", scheduledStart: startStr.slice(0, 16), scheduledEnd: endStr.slice(0, 16), isCampaignDay: false, notes: "" });
    setDetailSession(null);
    setOpen(true);
  }

  function handleEventClick(arg: EventClickArg) {
    const s: Session = arg.event.extendedProps.session;
    setDetailSession(s);
  }

  function openEdit(s: Session) {
    setDetailSession(null);
    setEditing(s);
    setForm({
      roomId: s.roomId, liveHostId: s.liveHostId, brandId: s.brandId,
      platform: s.platform, scheduledStart: s.scheduledStart.slice(0, 16),
      scheduledEnd: s.scheduledEnd.slice(0, 16), isCampaignDay: s.isCampaignDay, notes: s.notes || "",
    });
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    const url = editing ? `/api/sessions/${editing.id}` : "/api/sessions";
    const method = editing ? "PUT" : "POST";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    setOpen(false);
    if (viewRange.start) loadSessions(viewRange.start, viewRange.end);
  }

  async function deleteSession(id: string) {
    if (!confirm("Delete this session?")) return;
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    setDetailSession(null);
    if (viewRange.start) loadSessions(viewRange.start, viewRange.end);
  }

  async function loadSuggestions() {
    setSuggestLoading(true);
    const cal = calRef.current;
    const now = cal ? cal.getApi().getDate() : new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const params = new URLSearchParams({ month: String(month), year: String(year) });
    if (suggestFilter) params.set("brandId", suggestFilter);
    const res = await fetch(`/api/schedule/suggest?${params}`);
    setSuggestResult(await res.json());
    setSuggestLoading(false);
  }

  function applyToSchedule(s: Suggestion) {
    const [h, m] = s.suggestedSlot.split(":");
    const startDt = `${s.date}T${h.padStart(2,"0")}:${m}`;
    const endH = String(parseInt(h) + 2).padStart(2, "0");
    const endDt = `${s.date}T${endH}:${m}`;
    // Pre-fill preferred brand if only one
    const brandId = s.preferredBrandIds.length === 1 ? s.preferredBrandIds[0] : "";
    setEditing(null);
    setForm({
      roomId: rooms[0]?.id || "",
      liveHostId: s.hostId,
      brandId,
      platform: "TIKTOK",
      scheduledStart: startDt,
      scheduledEnd: endDt,
      isCampaignDay: false,
      notes: "",
    });
    setDetailSession(null);
    setOpen(true);
  }

  async function exportMonthEmail() {
    setEmailLoading(true);
    const cal = calRef.current;
    if (!cal) return;
    const view = cal.getApi().view;
    const start = view.activeStart.toISOString();
    const end = view.activeEnd.toISOString();
    const res = await fetch("/api/email/schedule-export", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start, end }),
    });
    const data = await res.json();
    setEmailLoading(false);
    if (data.ok) alert(`Schedule emailed to ${data.count} client(s)!`);
    else alert(`Error: ${data.error}`);
  }

  const handleDatesSet = useCallback((arg: { startStr: string; endStr: string }) => {
    setViewRange({ start: arg.startStr, end: arg.endStr });
  }, []);

  async function handleEventDrop(arg: EventDropArg) {
    const s: Session = arg.event.extendedProps.session;
    const newStart = arg.event.start!.toISOString();
    const durationMs = new Date(s.scheduledEnd).getTime() - new Date(s.scheduledStart).getTime();
    const newEnd = new Date(arg.event.start!.getTime() + durationMs).toISOString();
    const res = await fetch(`/api/sessions/${s.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId: s.roomId, liveHostId: s.liveHostId, brandId: s.brandId,
        platform: s.platform, scheduledStart: newStart, scheduledEnd: newEnd,
        isCampaignDay: s.isCampaignDay, notes: s.notes,
      }),
    });
    if (!res.ok) { arg.revert(); alert("Failed to update session time."); }
    else if (viewRange.start) loadSessions(viewRange.start, viewRange.end);
  }

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Schedule</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Click a time slot to add a session. Click a session to view details.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setBulkOpen(true)}
            style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
            <Wand2 size={14} /> Auto-Schedule
          </Button>
          <Button variant="outline" onClick={() => setManualOpen(true)}>
            <CalendarPlus size={14} /> Manual Slot
          </Button>
          <Button variant="outline" onClick={() => { setSuggestOpen(v => !v); if (!suggestResult) loadSuggestions(); }}
            style={suggestOpen ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}>
            <Sparkles size={14} /> Suggest Slots {suggestOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </Button>
          <Button variant="outline" onClick={exportMonthEmail} loading={emailLoading}>
            <Mail size={14} /> Email to Clients
          </Button>
          <Button onClick={() => {
            setEditing(null);
            setForm({ roomId: "", liveHostId: "", brandId: "", platform: "TIKTOK", scheduledStart: "", scheduledEnd: "", isCampaignDay: false, notes: "" });
            setOpen(true);
          }}>
            <Plus size={14} /> Add Session
          </Button>
        </div>
      </div>

      {/* Auto-Suggest Panel */}
      {suggestOpen && (
        <div className="section-card p-4 space-y-3 animate-in">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Sparkles size={14} style={{ color: "var(--accent)" }} />
              <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                Available Slots — {suggestResult ? `${suggestResult.month}/${suggestResult.year}` : "…"}
              </span>
              {suggestResult && (
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {suggestResult.stats.available} available · {suggestResult.stats.conflicts} conflicts · {suggestResult.stats.offDays} off days
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={suggestFilter}
                onChange={(e) => setSuggestFilter(e.target.value)}
                className="text-xs px-2 py-1 rounded-lg"
                style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
              >
                <option value="">All brands</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <Button size="sm" variant="secondary" onClick={loadSuggestions} loading={suggestLoading}>Refresh</Button>
            </div>
          </div>

          {suggestLoading && <div className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>Loading suggestions…</div>}

          {suggestResult && suggestResult.suggestions.length === 0 && !suggestLoading && (
            <div className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>No available slots found for this month.</div>
          )}

          {suggestResult && suggestResult.suggestions.length > 0 && (
            <div className="overflow-x-auto">
              <table className="data-table text-sm">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Day</th>
                    <th>Host</th>
                    <th>Preferred Slot</th>
                    <th>Preferred Brands</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestResult.suggestions.slice(0, 60).map((s, i) => {
                    const matchedBrands = brands.filter(b => s.preferredBrandIds.includes(b.id));
                    return (
                      <tr key={i}>
                        <td className="font-medium">{s.date}</td>
                        <td style={{ color: "var(--text-muted)" }}>{s.dayOfWeek}</td>
                        <td>
                          <span className="font-medium" style={{ color: "var(--text-primary)" }}>{s.hostName}</span>
                          <span className="ml-1 text-xs" style={{ color: "var(--text-muted)" }}>({s.displayName})</span>
                        </td>
                        <td>
                          <span className="px-2 py-0.5 rounded-md text-xs font-semibold"
                            style={{ background: "var(--accent-light)", color: "var(--accent-text)" }}>
                            {s.suggestedSlot}
                          </span>
                        </td>
                        <td>
                          <div className="flex gap-1 flex-wrap">
                            {matchedBrands.length > 0
                              ? matchedBrands.map(b => (
                                  <span key={b.id} className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                                    style={{ background: b.color + "25", color: b.color, border: `1px solid ${b.color}50` }}>
                                    {b.name}
                                  </span>
                                ))
                              : <span className="text-xs" style={{ color: "var(--text-muted)" }}>Any</span>
                            }
                          </div>
                        </td>
                        <td className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => applyToSchedule(s)}>
                            <CalendarPlus size={12} /> Schedule
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {suggestResult.suggestions.length > 60 && (
                <p className="text-xs mt-2 text-center" style={{ color: "var(--text-muted)" }}>
                  Showing 60 of {suggestResult.suggestions.length} suggestions
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filters + Legend */}
      <div className="section-card p-3 flex items-center gap-3 flex-wrap">
        <Filter size={14} style={{ color: "var(--text-muted)" }} className="flex-shrink-0" />
        <Select value={filterHost} onChange={(e) => setFilterHost(e.target.value)} className="w-40">
          <option value="">All Hosts</option>
          {hosts.map((h) => <option key={h.id} value={h.id}>{h.user.name}</option>)}
        </Select>
        <Select value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)} className="w-40">
          <option value="">All Brands</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select value={filterRoom} onChange={(e) => setFilterRoom(e.target.value)} className="w-36">
          <option value="">All Rooms</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        {(filterHost || filterBrand || filterRoom) && (
          <Button size="sm" variant="ghost" onClick={() => { setFilterHost(""); setFilterBrand(""); setFilterRoom(""); }}>
            Clear
          </Button>
        )}
        <div className="ml-auto flex items-center gap-3 text-xs flex-wrap" style={{ color: "var(--text-muted)" }}>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "var(--text-muted)" }} />Scheduled</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" />Early</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />On Time</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />Late</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />Missed</span>
        </div>
      </div>

      {/* Calendar */}
      <div className="section-card p-4">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek" }}
          buttonText={{ month: "Month", week: "Week", day: "Day", list: "List" }}
          height="calc(100vh - 310px)"
          events={calEvents}
          selectable selectMirror editable dayMaxEvents={5}
          slotMinTime="06:00:00" slotMaxTime="02:00:00" scrollTime="08:00:00"
          allDaySlot={false} nowIndicator
          select={handleDateSelect}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          datesSet={handleDatesSet}
          eventContent={(arg) => {
            const s: Session = arg.event.extendedProps.session;
            const isMonth = arg.view.type === "dayGridMonth";
            if (isMonth) {
              return (
                <div className="px-1.5 py-0.5 w-full truncate leading-tight flex items-center gap-1" title={`${s.brand.name} · ${s.liveHost.user.name}`}>
                  <span className="font-semibold truncate text-[11px]">{s.brand.name}</span>
                </div>
              );
            }
            return (
              <div className="px-1 py-0.5 truncate leading-tight">
                <div className="font-semibold truncate">{s.brand.name}</div>
                <div className="opacity-80 truncate text-[10px]">{s.liveHost.user.name} · {s.room.name}</div>
              </div>
            );
          }}
        />
      </div>

      {/* Session Detail Modal */}
      {detailSession && (
        <Modal open={!!detailSession} onClose={() => setDetailSession(null)} title="Session Details" size="md">
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: detailSession.brand.color }} />
              <span className="font-semibold text-base" style={{ color: "var(--text-primary)" }}>{detailSession.liveHost.user.name}</span>
              <span style={{ color: "var(--text-muted)" }}>·</span>
              <span style={{ color: "var(--text-secondary)" }}>{detailSession.brand.name}</span>
              <PunctualityBadge status={detailSession.status} punctuality={detailSession.punctuality} />
              {detailSession.isCampaignDay && <Badge variant="warning">Campaign Day</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <InfoRow label="Room" value={detailSession.room.name} />
              <InfoRow label="Platform" value={detailSession.platform} />
              <InfoRow label="Scheduled Start" value={format(new Date(detailSession.scheduledStart), "dd MMM yyyy HH:mm")} />
              <InfoRow label="Scheduled End" value={format(new Date(detailSession.scheduledEnd), "HH:mm")} />
              <InfoRow label="Duration (scheduled)" value={(() => {
                const ms = new Date(detailSession.scheduledEnd).getTime() - new Date(detailSession.scheduledStart).getTime();
                const h = Math.floor(ms / 3600000);
                const m = Math.round((ms % 3600000) / 60000);
                return m > 0 ? `${h}h ${m}m` : `${h}h`;
              })()} />
              {detailSession.actualStart && <InfoRow label="Actual Start" value={format(new Date(detailSession.actualStart), "HH:mm")} />}
              {(detailSession as any).actualDurationMinutes != null && (
                <InfoRow label="Actual Duration" value={(() => {
                  const min = (detailSession as any).actualDurationMinutes as number;
                  return `${Math.floor(min / 60)}h ${min % 60}m`;
                })()} />
              )}
              {detailSession.gmv != null && <InfoRow label="GMV" value={formatCurrency(detailSession.gmv)} />}
              {(detailSession as any).adsCost != null && <InfoRow label="Ads Cost" value={formatCurrency((detailSession as any).adsCost)} />}
            </div>
            {detailSession.notes && (
              <div
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
              >
                {detailSession.notes}
              </div>
            )}
            <div className="flex justify-between pt-2" style={{ borderTop: "1px solid var(--border)" }}>
              <Button variant="destructive" size="sm" onClick={() => deleteSession(detailSession.id)}>Delete</Button>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setDetailSession(null)}>Close</Button>
                <Button size="sm" onClick={() => openEdit(detailSession)}>Edit</Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Bulk Auto-Schedule Modal */}
      {bulkOpen && (
        <BulkScheduleModal
          hosts={hosts} brands={brands} rooms={rooms}
          onClose={() => setBulkOpen(false)}
          onCreated={() => { setBulkOpen(false); if (viewRange.start) loadSessions(viewRange.start, viewRange.end); }}
        />
      )}

      {/* Manual Slot Modal */}
      {manualOpen && (
        <ManualSlotModal
          hosts={hosts} brands={brands} rooms={rooms}
          onClose={() => setManualOpen(false)}
          onCreated={() => { setManualOpen(false); if (viewRange.start) loadSessions(viewRange.start, viewRange.end); }}
        />
      )}

      {/* Create / Edit Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Session" : "New Session"} size="lg">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Live Host</label>
            <Select value={form.liveHostId} onChange={(e) => setForm({ ...form, liveHostId: e.target.value })}>
              <option value="">Select host…</option>
              {hosts.map((h) => <option key={h.id} value={h.id}>{h.user.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Brand</label>
            <Select value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}>
              <option value="">Select brand…</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Room</label>
            <Select value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}>
              <option value="">Select room…</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Platform</label>
            <Select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
              <option value="TIKTOK">TikTok</option>
              <option value="SHOPEE">Shopee</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Start Time</label>
            <Input type="datetime-local" value={form.scheduledStart} onChange={(e) => setForm({ ...form, scheduledStart: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>End Time</label>
            <Input type="datetime-local" value={form.scheduledEnd} onChange={(e) => setForm({ ...form, scheduledEnd: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Notes</label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes…" />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="campaign"
              checked={form.isCampaignDay}
              onChange={(e) => setForm({ ...form, isCampaignDay: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="campaign" className="text-sm cursor-pointer" style={{ color: "var(--text-secondary)" }}>
              Campaign Day (higher KPI tier)
            </label>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-4 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save Session</Button>
        </div>
      </Modal>
    </div>
  );
}

// ── Bulk Auto-Schedule Modal ──────────────────────────────────────────────────

interface BulkScheduleModalProps {
  hosts: Host[];
  brands: Brand[];
  rooms: Room[];
  onClose: () => void;
  onCreated: () => void;
}

interface PreviewSession {
  date: string;
  dayOfWeek: string;
  brandId: string;
  brandName: string;
  brandColor: string;
  scheduledStart: string;
  scheduledEnd: string;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function BulkScheduleModal({ hosts, brands, rooms, onClose, onCreated }: BulkScheduleModalProps) {
  const now = new Date();
  const [hostId, setHostId] = useState("");
  const [brand1Id, setBrand1Id] = useState("");
  const [brand2Id, setBrand2Id] = useState("");
  const [roomId, setRoomId] = useState(rooms[0]?.id || "");
  const [platform, setPlatform] = useState("TIKTOK");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [startTime, setStartTime] = useState("20:00");
  const [durationH, setDurationH] = useState("2");
  // 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat — skip if true
  const [skipDays, setSkipDays] = useState<Set<number>>(new Set([0, 6]));
  const [preview, setPreview] = useState<PreviewSession[] | null>(null);
  const [saving, setSaving] = useState(false);

  function toggleSkipDay(dow: number) {
    setSkipDays(prev => {
      const next = new Set(prev);
      next.has(dow) ? next.delete(dow) : next.add(dow);
      return next;
    });
    setPreview(null);
  }

  function generatePreview() {
    if (!hostId || !brand1Id || !roomId) return;
    const brandsToUse = [brand1Id, brand2Id].filter(Boolean);
    const monthStart = startOfMonth(new Date(year, month - 1));
    const monthEnd = endOfMonth(new Date(year, month - 1));
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const [sh, sm] = startTime.split(":").map(Number);
    const totalMins = sh * 60 + sm + Number(durationH) * 60;
    const endH = Math.floor(totalMins / 60) % 24;
    const endM = totalMins % 60;
    const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

    let brandIdx = 0;
    const sessions: PreviewSession[] = [];
    for (const day of days) {
      const dow = getDay(day);
      if (skipDays.has(dow)) continue;
      const dateStr = format(day, "yyyy-MM-dd");
      const bId = brandsToUse[brandIdx % brandsToUse.length];
      const brand = brands.find((b) => b.id === bId);
      if (!brand) continue;
      sessions.push({
        date: dateStr, dayOfWeek: DOW[dow], brandId: bId,
        brandName: brand.name, brandColor: brand.color,
        scheduledStart: `${dateStr}T${startTime}`,
        scheduledEnd: `${dateStr}T${endTime}`,
      });
      brandIdx++;
    }
    setPreview(sessions);
  }

  async function createAll() {
    if (!preview || preview.length === 0) return;
    setSaving(true);
    const sessions = preview.map((s) => ({
      liveHostId: hostId, brandId: s.brandId, roomId, platform,
      scheduledStart: s.scheduledStart, scheduledEnd: s.scheduledEnd,
      isCampaignDay: false, notes: "",
    }));
    const res = await fetch("/api/sessions/bulk", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) { alert(`Created ${data.created} session(s) successfully!`); onCreated(); }
    else alert(`Error: ${data.error}`);
  }

  const selectedHost = hosts.find((h) => h.id === hostId);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const endTimeStr = (() => {
    const [sh, sm] = startTime.split(":").map(Number);
    const t = sh * 60 + sm + Number(durationH) * 60;
    return `${String(Math.floor(t / 60) % 24).padStart(2,"0")}:${String(t % 60).padStart(2,"0")}`;
  })();

  return (
    <Modal open onClose={onClose} title="Auto-Schedule Month" size="xl">
      <div className="space-y-5">
        {/* Config row 1: host + brands */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Live Host *</label>
            <Select value={hostId} onChange={(e) => { setHostId(e.target.value); setPreview(null); }}>
              <option value="">Select host…</option>
              {hosts.map((h) => <option key={h.id} value={h.id}>{h.user.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Brand 1 *</label>
            <Select value={brand1Id} onChange={(e) => { setBrand1Id(e.target.value); setPreview(null); }}>
              <option value="">Select brand…</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Brand 2 (alternates)</label>
            <Select value={brand2Id} onChange={(e) => { setBrand2Id(e.target.value); setPreview(null); }}>
              <option value="">Same brand every day</option>
              {brands.filter((b) => b.id !== brand1Id).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
        </div>

        {/* Config row 2: room, platform, month, time, duration */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Room *</label>
            <Select value={roomId} onChange={(e) => { setRoomId(e.target.value); setPreview(null); }}>
              <option value="">Select room…</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Platform</label>
            <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="TIKTOK">TikTok</option>
              <option value="SHOPEE">Shopee</option>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Start Time</label>
            <Input type="time" value={startTime} onChange={(e) => { setStartTime(e.target.value); setPreview(null); }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Duration</label>
            <Select value={durationH} onChange={(e) => { setDurationH(e.target.value); setPreview(null); }}>
              {[1,2,3,4,5,6,7,8].map((n) => <option key={n} value={n}>{n}h</option>)}
            </Select>
          </div>
        </div>

        {/* Month picker + skip days */}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Month</label>
            <div className="flex gap-1.5">
              <Select value={month} onChange={(e) => { setMonth(Number(e.target.value)); setPreview(null); }} className="w-24">
                {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </Select>
              <Input type="number" value={year} min={2024} max={2030}
                onChange={(e) => { setYear(Number(e.target.value)); setPreview(null); }} className="w-20" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Skip days</label>
            <div className="flex gap-1">
              {[["Mon",1],["Tue",2],["Wed",3],["Thu",4],["Fri",5],["Sat",6],["Sun",0]].map(([label, dow]) => (
                <button
                  key={dow}
                  onClick={() => toggleSkipDay(dow as number)}
                  className="w-9 h-8 rounded text-xs font-medium transition-all cursor-pointer"
                  style={skipDays.has(dow as number)
                    ? { background: "#ef444420", color: "#ef4444", border: "1px solid #ef444440" }
                    : { background: "var(--accent-light)", color: "var(--accent-text)", border: "1px solid var(--accent)30" }}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Red = skipped, coloured = working</p>
          </div>
        </div>

        <Button variant="secondary" onClick={generatePreview} disabled={!hostId || !brand1Id || !roomId}>
          <Sparkles size={13} /> Preview Schedule
        </Button>

        {/* Calendar preview */}
        {preview && preview.length === 0 && (
          <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>No working days found for this selection.</p>
        )}

        {preview && preview.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {preview.length} sessions · {selectedHost?.user.name}
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {months[month - 1]} {year} · {startTime}–{endTimeStr}
              </span>
            </div>
            <CalendarPreview month={month} year={year} sessions={preview} />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button onClick={createAll} loading={saving}>
                <CalendarPlus size={13} /> Create {preview.length} Sessions
              </Button>
            </div>
          </div>
        )}

        {!preview && (
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function CalendarPreview({ month, year, sessions }: { month: number; year: number; sessions: PreviewSession[] }) {
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(new Date(year, month - 1));
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Build a map date→session
  const sessionMap = new Map(sessions.map(s => [s.date, s]));

  // Build calendar grid: weeks of Mon–Sun
  const weeks: (Date | null)[][] = [];
  let week: (Date | null)[] = [];
  // Fill leading empty slots (Mon=0 offset)
  const firstDow = (getDay(monthStart) + 6) % 7; // Mon-based offset
  for (let i = 0; i < firstDow; i++) week.push(null);
  for (const day of days) {
    week.push(day);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  const dowLabels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
      {/* Header */}
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold py-2"
        style={{ background: "var(--bg-subtle)", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
        {dowLabels.map(d => <div key={d}>{d}</div>)}
      </div>
      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7" style={{ borderBottom: wi < weeks.length - 1 ? "1px solid var(--border)" : "none" }}>
          {week.map((day, di) => {
            const dateStr = day ? format(day, "yyyy-MM-dd") : null;
            const s = dateStr ? sessionMap.get(dateStr) : null;
            return (
              <div key={di}
                className="min-h-[52px] p-1.5 text-[11px] flex flex-col gap-0.5"
                style={{
                  borderRight: di < 6 ? "1px solid var(--border)" : "none",
                  background: !day ? "var(--bg-subtle)" : "transparent",
                }}
              >
                {day && (
                  <>
                    <span className="font-medium leading-none" style={{ color: s ? "var(--text-primary)" : "var(--text-muted)" }}>
                      {format(day, "d")}
                    </span>
                    {s && (
                      <span
                        className="rounded px-1 py-0.5 font-medium truncate leading-tight"
                        style={{ background: s.brandColor + "25", color: s.brandColor, fontSize: "10px" }}
                      >
                        {s.brandName.split(" ")[0]}
                      </span>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Manual Slot Modal ─────────────────────────────────────────────────────────

function ManualSlotModal({ hosts, brands, rooms, onClose, onCreated }: BulkScheduleModalProps) {
  const now = new Date();
  const [hostId, setHostId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [roomId, setRoomId] = useState(rooms[0]?.id || "");
  const [platform, setPlatform] = useState("TIKTOK");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [startTime, setStartTime] = useState("20:00");
  const [durationH, setDurationH] = useState("2");
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const endTimeStr = (() => {
    const [sh, sm] = startTime.split(":").map(Number);
    const t = sh * 60 + sm + Number(durationH) * 60;
    return `${String(Math.floor(t / 60) % 24).padStart(2,"0")}:${String(t % 60).padStart(2,"0")}`;
  })();

  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(new Date(year, month - 1));
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  function toggleDate(dateStr: string) {
    setSelectedDates(prev => {
      const next = new Set(prev);
      next.has(dateStr) ? next.delete(dateStr) : next.add(dateStr);
      return next;
    });
  }

  // Build calendar grid (Mon-based)
  const weeks: (Date | null)[][] = [];
  let week: (Date | null)[] = [];
  const firstDow = (getDay(monthStart) + 6) % 7;
  for (let i = 0; i < firstDow; i++) week.push(null);
  for (const day of days) {
    week.push(day);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  const selectedBrand = brands.find(b => b.id === brandId);
  const dowLabels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  async function createSelected() {
    if (selectedDates.size === 0 || !hostId || !brandId || !roomId) return;
    setSaving(true);
    const sessions = Array.from(selectedDates).sort().map(dateStr => ({
      liveHostId: hostId, brandId, roomId, platform,
      scheduledStart: `${dateStr}T${startTime}`,
      scheduledEnd: `${dateStr}T${endTimeStr}`,
      isCampaignDay: false, notes: "",
    }));
    const res = await fetch("/api/sessions/bulk", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) { alert(`Created ${data.created} session(s)!`); onCreated(); }
    else alert(`Error: ${data.error}`);
  }

  return (
    <Modal open onClose={onClose} title="Manual Slot — Pick Days" size="xl">
      <div className="space-y-4">
        {/* Config */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Live Host *</label>
            <Select value={hostId} onChange={(e) => setHostId(e.target.value)}>
              <option value="">Select host…</option>
              {hosts.map((h) => <option key={h.id} value={h.id}>{h.user.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Brand *</label>
            <Select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">Select brand…</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Room *</label>
            <Select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">Select room…</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Platform</label>
            <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="TIKTOK">TikTok</option>
              <option value="SHOPEE">Shopee</option>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Start Time</label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Duration</label>
            <Select value={durationH} onChange={(e) => setDurationH(e.target.value)}>
              {[1,2,3,4,5,6,7,8].map((n) => <option key={n} value={n}>{n}h</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Month</label>
            <div className="flex gap-1.5">
              <Select value={month} onChange={(e) => { setMonth(Number(e.target.value)); setSelectedDates(new Set()); }} className="w-20">
                {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </Select>
              <Input type="number" value={year} min={2024} max={2030}
                onChange={(e) => { setYear(Number(e.target.value)); setSelectedDates(new Set()); }} className="w-20" />
            </div>
          </div>
          <div className="flex items-end pb-0.5">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {selectedDates.size} day{selectedDates.size !== 1 ? "s" : ""} selected · {startTime}–{endTimeStr}
            </span>
          </div>
        </div>

        {/* Calendar grid — click to toggle */}
        <div>
          <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
            Click days to select/deselect. {selectedBrand && <span>Sessions will use <strong style={{ color: selectedBrand.color }}>{selectedBrand.name}</strong>.</span>}
          </p>
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="grid grid-cols-7 text-center text-[11px] font-semibold py-2"
              style={{ background: "var(--bg-subtle)", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
              {dowLabels.map(d => <div key={d}>{d}</div>)}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7"
                style={{ borderBottom: wi < weeks.length - 1 ? "1px solid var(--border)" : "none" }}>
                {week.map((day, di) => {
                  const dateStr = day ? format(day, "yyyy-MM-dd") : null;
                  const selected = dateStr ? selectedDates.has(dateStr) : false;
                  return (
                    <div key={di}
                      onClick={() => dateStr && toggleDate(dateStr)}
                      className="min-h-[52px] p-1.5 flex flex-col gap-0.5 transition-colors"
                      style={{
                        borderRight: di < 6 ? "1px solid var(--border)" : "none",
                        background: selected
                          ? (selectedBrand ? selectedBrand.color + "20" : "var(--accent-light)")
                          : !day ? "var(--bg-subtle)" : "transparent",
                        cursor: day ? "pointer" : "default",
                      }}
                    >
                      {day && (
                        <>
                          <span className="text-[11px] font-medium leading-none"
                            style={{ color: selected ? (selectedBrand?.color || "var(--accent)") : "var(--text-muted)" }}>
                            {format(day, "d")}
                          </span>
                          {selected && selectedBrand && (
                            <span className="rounded px-1 py-0.5 font-medium truncate leading-tight"
                              style={{ background: selectedBrand.color + "25", color: selectedBrand.color, fontSize: "10px" }}>
                              {selectedBrand.name.split(" ")[0]}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            className="text-xs cursor-pointer"
            style={{ color: "var(--text-muted)" }}
            onClick={() => setSelectedDates(new Set())}
          >
            Clear all
          </button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={createSelected} loading={saving} disabled={selectedDates.size === 0 || !hostId || !brandId || !roomId}>
              <CalendarPlus size={13} /> Create {selectedDates.size} Session{selectedDates.size !== 1 ? "s" : ""}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
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

function PunctualityBadge({ status, punctuality }: { status: string; punctuality: string | null }) {
  if (status === "PENDING") return <Badge variant="secondary">Scheduled</Badge>;
  if (status === "MISSED") return <Badge variant="destructive">Missed</Badge>;
  if (punctuality === "EARLY") return <Badge variant="default">Early ✓</Badge>;
  if (punctuality === "ON_TIME") return <Badge variant="success">On Time ✓</Badge>;
  if (punctuality === "LATE") return <Badge variant="warning">Late</Badge>;
  return <Badge variant="success">Completed</Badge>;
}
