"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
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
import { Plus, Filter, Mail, Sparkles, ChevronDown, ChevronUp, CalendarPlus, Wand2, Download, Upload, Clock, BarChart2, Users, LayoutGrid, Calendar, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO } from "date-fns";
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
interface Host { id: string; displayName: string; type: string; user: { name: string }; }
interface Brand { id: string; name: string; color: string; platform: string; }

interface HoursRow { id: string; name: string; displayName?: string; color?: string; scheduled: number; target: number; }
interface HoursData { month: number; year: number; hosts: HoursRow[]; brands: HoursRow[]; }
interface Session {
  id: string; roomId: string | null; liveHostId: string | null; brandId: string; platform: string;
  scheduledStart: string; scheduledEnd: string; isCampaignDay: boolean; notes: string | null;
  slotColor: string | null;
  status: string; punctuality: string | null; gmv: number | null; actualStart: string | null;
  room: Room | null; brand: Brand; liveHost: { user: { name: string }; displayName: string } | null;
}

// Helpers to keep all times in MYT (UTC+8) — the server runs in UTC so we
// must append the offset before sending and convert back when pre-filling edits.
function toMYT(dt: string) {
  return dt.length === 16 ? `${dt}:00+08:00` : dt;
}
function toInputMYT(iso: string) {
  const d = new Date(iso);
  const myt = new Date(d.getTime() + 8 * 3600_000);
  return myt.toISOString().slice(0, 16);
}

const PUNCTUALITY_COLORS: Record<string, string> = {
  EARLY: "#6366f1", ON_TIME: "#22c55e", LATE: "#f59e0b", default: "#94a3b8",
};

export default function SchedulePage() {
  const { data: authSession } = useSession();
  const isAdmin = (authSession?.user as { role?: string })?.role === "ADMIN";
  const calRef = useRef<FullCalendar>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; platform: string; startDate: string; endDate: string; brandId: string | null; brand: { color: string; name: string } | null }[]>([]);
  // Applied filters (drive data fetching + rendering)
  const [filterHost, setFilterHost] = useState("");
  const [filterBrand, setFilterBrand] = useState("");
  const [filterRoom, setFilterRoom] = useState("");
  const [filterType, setFilterType] = useState("");
  // Pending filters (bound to dropdowns — only committed on Apply)
  const [pendingHost, setPendingHost] = useState("");
  const [pendingBrand, setPendingBrand] = useState("");
  const [pendingRoom, setPendingRoom] = useState("");
  const [pendingType, setPendingType] = useState("");
  const [viewRange, setViewRange] = useState({ start: "", end: "" });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Session | null>(null);
  const [detailSession, setDetailSession] = useState<Session | null>(null);
  const [form, setForm] = useState({
    roomId: "", liveHostId: "", brandId: "", platform: "TIKTOK",
    scheduledStart: "", scheduledEnd: "", isCampaignDay: false, notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [is24h, setIs24h] = useState(true);
  const [emailLoading, setEmailLoading] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ summary: { created: number; updated: number; skipped: number }; } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestResult, setSuggestResult] = useState<SuggestResult | null>(null);
  const [suggestFilter, setSuggestFilter] = useState("");
  const [hoursOpen, setHoursOpen] = useState(false);
  const [hoursData, setHoursData] = useState<HoursData | null>(null);
  const [hoursLoading, setHoursLoading] = useState(false);
  const [clearAllLoading, setClearAllLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"calendar" | "grid">("calendar");
  const [gridDate, setGridDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  async function loadMeta() {
    const [r, h, b] = await Promise.all([fetch("/api/rooms"), fetch("/api/hosts"), fetch("/api/brands")]);
    const roomData: Room[] = await r.json();
    setRooms(roomData.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })));
    setHosts(await h.json());
    setBrands(await b.json());
  }

  async function loadCampaigns(start: string, end: string) {
    const s = new Date(start); const e = new Date(end);
    const months = new Set<string>();
    for (let d = new Date(s); d <= e; d.setMonth(d.getMonth() + 1))
      months.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
    const all: typeof campaigns = [];
    await Promise.all([...months].map(async (key) => {
      const [yr, mo] = key.split("-");
      const res = await fetch(`/api/campaigns?month=${mo}&year=${yr}`, { cache: "no-store" });
      const data = await res.json();
      all.push(...data);
    }));
    setCampaigns(all);
  }

  async function loadSessions(start: string, end: string) {
    const params = new URLSearchParams({ start, end, _t: String(Date.now()) });
    if (filterHost) params.set("hostId", filterHost);
    if (filterBrand) params.set("brandId", filterBrand);
    const res = await fetch(`/api/sessions?${params}`, { cache: "no-store" });
    setSessions(await res.json());
  }

  // Load sessions for the month shown in grid view (MYT-aware boundaries)
  function gridMonthRange(dateStr: string) {
    const d = parseISO(dateStr);
    const first = format(startOfMonth(d), "yyyy-MM-dd");
    const last  = format(endOfMonth(d),   "yyyy-MM-dd");
    // +08:00 so the API's new Date() lands at midnight MYT, not midnight UTC
    return { start: `${first}T00:00:00+08:00`, end: `${last}T23:59:59+08:00` };
  }

  useEffect(() => { loadMeta(); }, []);
  useEffect(() => {
    if (viewMode === "grid") {
      const { start, end } = gridMonthRange(gridDate);
      loadSessions(start, end);
      loadCampaigns(start, end);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, gridDate]);

  // Restore time-format preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("scheduleTimeFormat24h");
    if (saved === "false") setIs24h(false);
  }, []);

  function toggleTimeFormat() {
    const next = !is24h;
    setIs24h(next);
    localStorage.setItem("scheduleTimeFormat24h", String(next));
  }

  useEffect(() => {
    if (viewRange.start) {
      loadSessions(viewRange.start, viewRange.end);
      loadCampaigns(viewRange.start, viewRange.end);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRange, filterHost, filterBrand]);

  function matchesTypeFilter(s: Session) {
    if (!filterType) return true;
    const hostType = (s.liveHost as unknown as { type?: string } | null)?.type ?? "FULL_TIME";
    return hostType === filterType;
  }

  const calEvents = sessions
    .filter((s) => (!filterRoom || s.roomId === filterRoom) && matchesTypeFilter(s))
    .map((s) => {
      const bgColor = s.status === "COMPLETED"
        ? (s.punctuality ? PUNCTUALITY_COLORS[s.punctuality] : PUNCTUALITY_COLORS.default)
        : s.status === "MISSED" ? "#ef4444"
        : s.liveHostId ? s.brand.color
        : (s.slotColor ?? s.brand.color);
      const durationMs = new Date(s.scheduledEnd).getTime() - new Date(s.scheduledStart).getTime();
      const durationHours = Math.round((durationMs / 3600000) * 10) / 10;
      const durationLabel = durationHours % 1 === 0 ? `${durationHours}h` : `${durationHours}h`;
      return {
        id: s.id,
        title: `${s.liveHost?.user.name ?? "Unassigned"} · ${durationLabel}`,
        start: s.scheduledStart,
        end: s.scheduledEnd,
        backgroundColor: bgColor,
        borderColor: bgColor,
        extendedProps: { session: s },
      };
    });

  // Add campaign periods as background events
  const campaignEvents = campaigns.map(c => ({
    id: `campaign-${c.id}`,
    title: `📢 ${c.name} (${c.platform === "BOTH" ? "TikTok + Shopee" : c.platform === "TIKTOK" ? "TikTok" : "Shopee"})`,
    start: c.startDate.slice(0, 10),
    end: (() => { const d = new Date(c.endDate); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })(),
    display: "background" as const,
    backgroundColor: c.platform === "TIKTOK" ? "#010101" : c.platform === "SHOPEE" ? "#EE4D2D" : "#6366f1",
    classNames: ["campaign-bg-event"],
    extendedProps: { isCampaign: true },
  }));

  // Check if a given date + brand falls within any campaign
  function isDateInCampaign(dateStr: string, brandId: string, sessionPlatform?: string): boolean {
    const d = dateStr.slice(0, 10);
    const platform = sessionPlatform ?? form.platform;
    return campaigns.some(c => {
      const start = c.startDate.slice(0, 10);
      const end   = c.endDate.slice(0, 10);
      if (d < start || d > end) return false;
      if (c.brandId && c.brandId !== brandId) return false;
      // Campaign platform must match or be BOTH; session platform must match campaign
      if (c.platform !== "BOTH" && c.platform !== platform) return false;
      return true;
    });
  }

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
      roomId: s.roomId ?? "", liveHostId: s.liveHostId ?? "", brandId: s.brandId,
      platform: s.platform,
      scheduledStart: toInputMYT(s.scheduledStart),
      scheduledEnd: toInputMYT(s.scheduledEnd),
      isCampaignDay: s.isCampaignDay, notes: s.notes || "",
    });
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    const url = editing ? `/api/sessions/${editing.id}` : "/api/sessions";
    const method = editing ? "PUT" : "POST";
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        scheduledStart: toMYT(form.scheduledStart),
        scheduledEnd: toMYT(form.scheduledEnd),
      }),
    });
    setSaving(false);
    setOpen(false);
    await reloadCurrentRange();
  }

  async function deleteSession(id: string) {
    if (!confirm("Delete this session?")) return;
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    setDetailSession(null);
    await reloadCurrentRange();
  }

  async function clearAllMonth() {
    // Derive the active month: use gridDate in grid mode, else calendar's active date
    const activeDate = viewMode === "grid"
      ? parseISO(gridDate)
      : calRef.current ? calRef.current.getApi().getDate() : new Date();
    const monthLabel = format(activeDate, "MMMM yyyy");
    if (!confirm(`Delete ALL sessions in ${monthLabel}? This cannot be undone.`)) return;
    setClearAllLoading(true);
    const start = `${format(startOfMonth(activeDate), "yyyy-MM-dd")}T00:00:00+08:00`;
    const end   = `${format(endOfMonth(activeDate),   "yyyy-MM-dd")}T23:59:59+08:00`;
    const res = await fetch("/api/sessions/bulk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start, end }),
    });
    const data = await res.json();
    setClearAllLoading(false);
    if (res.ok) {
      alert(`Cleared ${data.deleted} session(s) from ${monthLabel}.`);
      await reloadCurrentRange();
    } else {
      alert(`Error: ${data.error}`);
    }
  }

  function applyFilters() {
    setFilterType(pendingType);
    setFilterHost(pendingHost);
    setFilterBrand(pendingBrand);
    setFilterRoom(pendingRoom);
  }

  function clearFilters() {
    setPendingType(""); setPendingHost(""); setPendingBrand(""); setPendingRoom("");
    setFilterType(""); setFilterHost(""); setFilterBrand(""); setFilterRoom("");
  }

  async function reloadCurrentRange() {
    if (viewMode === "grid") {
      const { start, end } = gridMonthRange(gridDate);
      await loadSessions(start, end);
    } else if (viewRange.start) {
      await loadSessions(viewRange.start, viewRange.end);
    }
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

  async function loadHours(month?: number, year?: number) {
    setHoursLoading(true);
    const cal = calRef.current;
    const now = cal ? cal.getApi().getDate() : new Date();
    const m = month ?? (now.getMonth() + 1);
    const y = year ?? now.getFullYear();
    const res = await fetch(`/api/hours-targets?month=${m}&year=${y}`);
    setHoursData(await res.json());
    setHoursLoading(false);
  }

  function applyToSchedule(s: Suggestion) {
    const [h, m] = s.suggestedSlot.split(":");
    const startDt = `${s.date}T${h.padStart(2,"0")}:${m}`;
    const endH = String(parseInt(h) + 2).padStart(2, "0");
    const endDt = `${s.date}T${endH}:${m}`;

    // Conflict check: is this host already scheduled at this time?
    const proposedStart = new Date(toMYT(startDt)).getTime();
    const proposedEnd = new Date(toMYT(endDt)).getTime();
    const conflict = sessions.find(existing =>
      existing.liveHostId === s.hostId &&
      new Date(existing.scheduledStart).getTime() < proposedEnd &&
      new Date(existing.scheduledEnd).getTime() > proposedStart
    );
    if (conflict) {
      const conflictStart = toInputMYT(conflict.scheduledStart);
      alert(
        `${s.hostName} already has a session on ${s.date} at ${conflictStart.slice(11, 16)}.\n` +
        `Please choose a different host or time.`
      );
      return;
    }

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

  async function autoAssignHosts() {
    setAssignLoading(true);
    const cal = calRef.current;
    const now = cal ? cal.getApi().getDate() : new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const res = await fetch("/api/schedule/assign-hosts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, year }),
    });
    const data = await res.json();
    setAssignLoading(false);
    if (res.ok) {
      alert(`Assigned ${data.assigned} of ${data.total} unassigned slots!`);
      await reloadCurrentRange();
    } else {
      alert(`Error: ${data.error}`);
    }
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

  async function exportSessionsExcel() {
    const cal = calRef.current;
    if (!cal) return;
    const view = cal.getApi().view;
    const params = new URLSearchParams({ start: view.activeStart.toISOString(), end: view.activeEnd.toISOString() });
    const res = await fetch(`/api/export/sessions?${params}`);
    if (!res.ok) { alert("Export failed"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sessions-${format(view.activeStart, "yyyy-MM-dd")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importSessionsExcel() {
    if (!importFile) return;
    setImportLoading(true);
    setImportResult(null);
    const fd = new FormData();
    fd.append("file", importFile);
    const res = await fetch("/api/import/sessions", { method: "POST", body: fd });
    const data = await res.json();
    setImportLoading(false);
    if (data.ok) {
      setImportResult(data);
      await reloadCurrentRange();
    } else {
      alert(`Import failed: ${data.error}`);
    }
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
    else await reloadCurrentRange();
  }

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Schedule</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Click a time slot to add a session. Click a session to view details.
          </p>
        </div>
        {/* Desktop action bar */}
        <div className="hidden lg:flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setBulkOpen(true)}
            style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
            <Wand2 size={14} /> Auto-Schedule
          </Button>
          <Button variant="outline" onClick={autoAssignHosts} loading={assignLoading}
            style={{ borderColor: "var(--accent-purple)", color: "var(--accent-purple)" }}>
            <Users size={14} /> Assign Hosts
          </Button>
          <Button variant="outline" onClick={() => setManualOpen(true)}>
            <CalendarPlus size={14} /> Manual Slot
          </Button>
          <Button variant="outline" onClick={() => { setSuggestOpen(v => !v); if (!suggestResult) loadSuggestions(); }}
            style={suggestOpen ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}>
            <Sparkles size={14} /> Suggest Slots {suggestOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </Button>
          <Button variant="outline" onClick={() => { setHoursOpen(v => !v); if (!hoursData) loadHours(); }}
            style={hoursOpen ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}>
            <BarChart2 size={14} /> Hours {hoursOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </Button>
          <button
            onClick={toggleTimeFormat}
            title={`Switch to ${is24h ? "12-hour" : "24-hour"} format`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all cursor-pointer"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--bg-card)" }}
          >
            <Clock size={13} />
            {is24h ? "24h" : "12h"}
          </button>
          <Button variant="outline" onClick={exportSessionsExcel}>
            <Download size={14} /> Export Excel
          </Button>
          <Button variant="outline" onClick={() => { setImportOpen(true); setImportResult(null); setImportFile(null); }}>
            <Upload size={14} /> Import Excel
          </Button>
          <Button variant="outline" onClick={exportMonthEmail} loading={emailLoading}>
            <Mail size={14} /> Email to Clients
          </Button>
          {isAdmin && (
            <Button variant="outline" onClick={clearAllMonth} loading={clearAllLoading}
              style={{ borderColor: "#ef4444", color: "#ef4444" }}>
              <Trash2 size={14} /> Clear All
            </Button>
          )}
          <Button onClick={() => {
            setEditing(null);
            setForm({ roomId: "", liveHostId: "", brandId: "", platform: "TIKTOK", scheduledStart: "", scheduledEnd: "", isCampaignDay: false, notes: "" });
            setOpen(true);
          }}>
            <Plus size={14} /> Add Session
          </Button>
        </div>
        {/* Mobile action bar */}
        <div className="lg:hidden w-full space-y-2">
          {/* Primary row */}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => {
                setEditing(null);
                setForm({ roomId: "", liveHostId: "", brandId: "", platform: "TIKTOK", scheduledStart: "", scheduledEnd: "", isCampaignDay: false, notes: "" });
                setOpen(true);
              }}
            >
              <Plus size={14} /> Add Session
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setBulkOpen(true)}
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
              <Wand2 size={14} /> Auto-Schedule
            </Button>
          </div>
          {/* Secondary row */}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={autoAssignHosts} loading={assignLoading}
              style={{ borderColor: "var(--accent-purple)", color: "var(--accent-purple)" }}>
              <Users size={14} /> Assign Hosts
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setManualOpen(true)}>
              <CalendarPlus size={14} /> Manual Slot
            </Button>
            <Button variant="outline" className="flex-1"
              onClick={() => { setSuggestOpen(v => !v); if (!suggestResult) loadSuggestions(); }}
              style={suggestOpen ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}>
              <Sparkles size={14} /> Suggest {suggestOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </Button>
          </div>
          {/* Utility row — horizontal scroll */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
            <button
              onClick={toggleTimeFormat}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all cursor-pointer"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--bg-card)" }}
            >
              <Clock size={13} /> {is24h ? "24h" : "12h"}
            </button>
            <button
              onClick={exportSessionsExcel}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all cursor-pointer"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--bg-card)" }}
            >
              <Download size={13} /> Export
            </button>
            <button
              onClick={() => { setImportOpen(true); setImportResult(null); setImportFile(null); }}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all cursor-pointer"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--bg-card)" }}
            >
              <Upload size={13} /> Import
            </button>
            <button
              onClick={exportMonthEmail}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all cursor-pointer"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--bg-card)" }}
            >
              <Mail size={13} /> Email
            </button>
          </div>
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

      {/* Hours Tracker Panel */}
      {hoursOpen && (
        <HoursTrackerPanel
          data={hoursData}
          loading={hoursLoading}
          onRefresh={(m, y) => loadHours(m, y)}
          onTargetSaved={(m, y) => loadHours(m, y)}
        />
      )}

      {/* Filters + Legend */}
      <div className="section-card p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={14} style={{ color: "var(--text-muted)" }} className="flex-shrink-0" />
          {/* 1. Host Type */}
          <Select value={pendingType} onChange={(e) => { setPendingType(e.target.value); setPendingHost(""); }} className="flex-1 min-w-[110px] lg:w-36 lg:flex-none">
            <option value="">All Types</option>
            <option value="FULL_TIME">Full Time</option>
            <option value="PART_TIME">Part Time</option>
          </Select>
          {/* 2. Host Name — filtered by pending type */}
          <Select value={pendingHost} onChange={(e) => setPendingHost(e.target.value)} className="flex-1 min-w-[120px] lg:w-40 lg:flex-none">
            <option value="">All Hosts</option>
            {hosts
              .filter((h) => !pendingType || h.type === pendingType)
              .map((h) => <option key={h.id} value={h.id}>{h.user.name}</option>)}
          </Select>
          {/* 3. Brands */}
          <Select value={pendingBrand} onChange={(e) => setPendingBrand(e.target.value)} className="flex-1 min-w-[120px] lg:w-40 lg:flex-none">
            <option value="">All Brands</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          {/* 4. Rooms */}
          <Select value={pendingRoom} onChange={(e) => setPendingRoom(e.target.value)} className="flex-1 min-w-[100px] lg:w-36 lg:flex-none">
            <option value="">All Rooms</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <div className="flex items-center gap-2 ml-auto">
            {(filterHost || filterBrand || filterRoom || filterType) && (
              <Button size="sm" variant="ghost" onClick={clearFilters}>Clear</Button>
            )}
            <Button size="sm" onClick={applyFilters}
              style={{ background: "var(--accent)", color: "#fff" }}>
              Apply Filter
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: "var(--text-muted)" }}>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "var(--text-muted)" }} />Scheduled</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#6366f1" }} />Early</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />On Time</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />Late</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />Missed</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "var(--accent-yellow)" }} />Brand Slot (unassigned)</span>
        </div>
      </div>

      {/* View mode toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setViewMode("calendar")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all cursor-pointer"
          style={{
            borderColor: viewMode === "calendar" ? "var(--accent)" : "var(--border)",
            color: viewMode === "calendar" ? "var(--accent)" : "var(--text-secondary)",
            background: viewMode === "calendar" ? "color-mix(in oklab, var(--accent) 10%, var(--bg-card))" : "var(--bg-card)",
          }}
        >
          <Calendar size={13} /> Calendar
        </button>
        <button
          onClick={() => setViewMode("grid")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all cursor-pointer"
          style={{
            borderColor: viewMode === "grid" ? "var(--accent)" : "var(--border)",
            color: viewMode === "grid" ? "var(--accent)" : "var(--text-secondary)",
            background: viewMode === "grid" ? "color-mix(in oklab, var(--accent) 10%, var(--bg-card))" : "var(--bg-card)",
          }}
        >
          <LayoutGrid size={13} /> Daily Grid
        </button>
      </div>

      {/* Daily Grid View */}
      {viewMode === "grid" && (
        <DailyGridView
          gridDate={gridDate}
          setGridDate={setGridDate}
          sessions={sessions}
          rooms={rooms}
          hosts={hosts}
          brands={brands}
          filterHost={filterHost}
          filterBrand={filterBrand}
          filterRoom={filterRoom}
          filterType={filterType}
          onSessionClick={(s) => setDetailSession(s)}
          onAddSlot={(roomId, start, end) => {
            setEditing(null);
            setForm({ roomId, liveHostId: "", brandId: "", platform: "TIKTOK", scheduledStart: start, scheduledEnd: end, isCampaignDay: false, notes: "" });
            setDetailSession(null);
            setOpen(true);
          }}
        />
      )}

      {/* Calendar */}
      {viewMode === "calendar" && <div className="section-card p-4">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek" }}
          buttonText={{ month: "Month", week: "Week", day: "Day", list: "List" }}
          height="calc(100vh - 310px)"
          events={[...calEvents, ...campaignEvents]}
          selectable selectMirror editable dayMaxEvents={5}
          slotMinTime="06:00:00" slotMaxTime="26:00:00" scrollTime="08:00:00"
          allDaySlot={false} nowIndicator
          select={handleDateSelect}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          datesSet={handleDatesSet}
          eventContent={(arg) => {
            const s: Session = arg.event.extendedProps.session;
            const isMonth = arg.view.type === "dayGridMonth";
            const timeFmt = is24h ? "HH:mm" : "h:mm a";
            if (isMonth) {
              const timeLabel = format(parseISO(s.scheduledStart), timeFmt);
              const endLabel  = format(parseISO(s.scheduledEnd),   timeFmt);
              return (
                <div className="px-1.5 py-0.5 w-full truncate leading-tight"
                  title={`${s.brand.name} · ${s.liveHost?.displayName ?? "Unassigned"} · ${timeLabel}–${endLabel}`}>
                  <div className="font-semibold truncate text-[11px]">{s.brand.name}</div>
                  <div className="opacity-80 truncate text-[10px]">{timeLabel} · {s.liveHost?.displayName ?? "—"}</div>
                </div>
              );
            }
            // Week / Day view — show start–end time range
            const timeLabel = format(parseISO(s.scheduledStart), timeFmt);
            const endLabel  = format(parseISO(s.scheduledEnd),   timeFmt);
            return (
              <div className="px-1 py-0.5 truncate leading-tight">
                <div className="font-semibold truncate">{s.brand.name}</div>
                <div className="opacity-80 truncate text-[10px]">{timeLabel}–{endLabel}</div>
                <div className="opacity-60 truncate text-[10px]">{s.liveHost?.displayName ?? "Unassigned"}</div>
              </div>
            );
          }}
        />
      </div>}

      {/* Session Detail Modal */}
      {detailSession && (
        <Modal open={!!detailSession} onClose={() => setDetailSession(null)} title="Session Details" size="md">
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: detailSession.brand.color }} />
              <span className="font-semibold text-base" style={{ color: "var(--text-primary)" }}>{detailSession.liveHost?.user.name ?? "Unassigned"}</span>
              <span style={{ color: "var(--text-muted)" }}>·</span>
              <span style={{ color: "var(--text-secondary)" }}>{detailSession.brand.name}</span>
              <PunctualityBadge status={detailSession.status} punctuality={detailSession.punctuality} />
              {detailSession.isCampaignDay && <Badge variant="warning">Campaign Day</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <InfoRow label="Room" value={detailSession.room?.name ?? "—"} />
              <InfoRow label="Platform" value={detailSession.platform} />
              <InfoRow label="Scheduled Start" value={format(new Date(detailSession.scheduledStart), is24h ? "dd MMM yyyy HH:mm" : "dd MMM yyyy h:mm a")} />
              <InfoRow label="Scheduled End"   value={format(new Date(detailSession.scheduledEnd),   is24h ? "HH:mm" : "h:mm a")} />
              <InfoRow label="Duration (scheduled)" value={(() => {
                const ms = new Date(detailSession.scheduledEnd).getTime() - new Date(detailSession.scheduledStart).getTime();
                const h = Math.floor(ms / 3600000);
                const m = Math.round((ms % 3600000) / 60000);
                return m > 0 ? `${h}h ${m}m` : `${h}h`;
              })()} />
              {detailSession.actualStart && <InfoRow label="Actual Start" value={format(new Date(detailSession.actualStart), is24h ? "HH:mm" : "h:mm a")} />}
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

      {/* Import Excel Modal */}
      <Modal open={importOpen} onClose={() => { setImportOpen(false); setImportResult(null); }} title="Import Sessions from Excel" size="md">
        <div className="space-y-4">
          <div className="rounded-lg px-3 py-2.5 text-sm" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>
            <p className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>How it works</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Click <strong>Export Excel</strong> to download the current view&apos;s sessions.</li>
              <li>Amend Date, Start/End Times, Host/Brand/Room IDs, Platform, Notes in the file.</li>
              <li>Save and upload the amended file here to sync changes.</li>
            </ol>
            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>Rows with a Session ID will be <strong>updated</strong>. Rows without an ID will create new sessions.</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Select Excel File (.xlsx)
            </label>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => { setImportFile(e.target.files?.[0] ?? null); setImportResult(null); }}
              className="block w-full text-sm rounded-lg px-3 py-2 cursor-pointer"
              style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            />
          </div>

          {importResult && (
            <div className="rounded-lg px-3 py-2.5 text-sm" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-success, #86efac)" }}>
              <p className="font-semibold mb-1" style={{ color: "var(--accent)" }}>✓ Import complete</p>
              <div className="flex gap-4 text-xs">
                <span><strong style={{ color: "#22c55e" }}>{importResult.summary.created}</strong> created</span>
                <span><strong style={{ color: "var(--accent)" }}>{importResult.summary.updated}</strong> updated</span>
                <span><strong style={{ color: "var(--text-muted)" }}>{importResult.summary.skipped}</strong> skipped</span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1" style={{ borderTop: "1px solid var(--border)" }}>
            <Button variant="secondary" onClick={() => { setImportOpen(false); setImportResult(null); }}>Close</Button>
            <Button onClick={importSessionsExcel} loading={importLoading} disabled={!importFile}>
              <Upload size={14} /> Upload &amp; Sync
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Auto-Schedule Modal */}
      {bulkOpen && (
        <BulkScheduleModal
          hosts={hosts} brands={brands} rooms={rooms}
          onClose={() => setBulkOpen(false)}
          onCreated={() => { setBulkOpen(false); reloadCurrentRange(); }}
        />
      )}

      {/* Manual Slot Modal */}
      {manualOpen && (
        <ManualSlotModal
          hosts={hosts} brands={brands} rooms={rooms}
          onClose={() => setManualOpen(false)}
          onCreated={() => { setManualOpen(false); reloadCurrentRange(); }}
        />
      )}

      {/* Create / Edit Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Session" : "New Session"} size="lg">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Live Host <span className="font-normal text-xs" style={{ color: "var(--text-muted)" }}>(optional)</span></label>
            <Select value={form.liveHostId} onChange={(e) => setForm({ ...form, liveHostId: e.target.value })}>
              <option value="">Select host…</option>
              {hosts.map((h) => <option key={h.id} value={h.id}>{h.user.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Brand</label>
            <Select value={form.brandId} onChange={(e) => {
              const selectedBrand = brands.find((b) => b.id === e.target.value);
              const autoPlatform = selectedBrand?.platform === "SHOPEE" ? "SHOPEE"
                : selectedBrand?.platform === "TIKTOK" ? "TIKTOK"
                : form.platform;
              const autoIsCampaign = form.scheduledStart
                ? isDateInCampaign(form.scheduledStart, e.target.value, autoPlatform)
                : form.isCampaignDay;
              setForm({ ...form, brandId: e.target.value, platform: autoPlatform, isCampaignDay: autoIsCampaign });
            }}>
              <option value="">Select brand…</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Room <span className="font-normal text-xs" style={{ color: "var(--text-muted)" }}>(optional)</span></label>
            <Select value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}>
              <option value="">Select room…</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Platform</label>
            <Select value={form.platform} onChange={(e) => {
              const newPlatform = e.target.value;
              const autoIsCampaign = form.scheduledStart && form.brandId
                ? isDateInCampaign(form.scheduledStart, form.brandId, newPlatform)
                : form.isCampaignDay;
              setForm({ ...form, platform: newPlatform, isCampaignDay: autoIsCampaign });
            }}>
              <option value="TIKTOK">TikTok</option>
              <option value="SHOPEE">Shopee</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Start Time</label>
            <Input type="datetime-local" value={form.scheduledStart} onChange={(e) => {
              const autoIsCampaign = form.brandId
                ? isDateInCampaign(e.target.value, form.brandId)
                : form.isCampaignDay;
              setForm({ ...form, scheduledStart: e.target.value, isCampaignDay: autoIsCampaign });
            }} />
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

interface TimeSlotRow { id: string; startTime: string; durationH: string; color: string; }

const SLOT_COLORS = ["#F97316","#1677FF","#6366F1","#FFC21A","#22C55E","#EC4899","#14B8A6","#F59E0B"];

function calcEndTime(startTime: string, durationH: string): string {
  const [sh, sm] = startTime.split(":").map(Number);
  const t = sh * 60 + sm + Number(durationH) * 60;
  return `${String(Math.floor(t / 60) % 24).padStart(2,"0")}:${String(t % 60).padStart(2,"0")}`;
}

let tsIdCounter = 0;
function newTimeSlot(startTime = "20:00", durationH = "2"): TimeSlotRow {
  const color = SLOT_COLORS[tsIdCounter % SLOT_COLORS.length];
  return { id: String(tsIdCounter++), startTime, durationH, color };
}

function ManualSlotModal({ hosts: _hosts, brands, rooms: _rooms, onClose, onCreated }: BulkScheduleModalProps) {
  const now = new Date();
  const [brandId, setBrandId] = useState("");
  const [platform, setPlatform] = useState("TIKTOK");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [timeSlots, setTimeSlots] = useState<TimeSlotRow[]>(() => [newTimeSlot()]);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null);

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const dowLabels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(new Date(year, month - 1));
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const weeks: (Date | null)[][] = [];
  let week: (Date | null)[] = [];
  const firstDow = (getDay(monthStart) + 6) % 7;
  for (let i = 0; i < firstDow; i++) week.push(null);
  for (const day of days) { week.push(day); if (week.length === 7) { weeks.push(week); week = []; } }
  if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }

  function toggleDate(dateStr: string) {
    setSelectedDates(prev => { const n = new Set(prev); n.has(dateStr) ? n.delete(dateStr) : n.add(dateStr); return n; });
  }

  function addTimeSlot() {
    const last = timeSlots[timeSlots.length - 1];
    // Default next slot to start right after the last one ends
    const nextStart = calcEndTime(last.startTime, last.durationH);
    setTimeSlots(prev => [...prev, newTimeSlot(nextStart, last.durationH)]);
  }

  function removeTimeSlot(id: string) {
    if (timeSlots.length === 1) return;
    setTimeSlots(prev => prev.filter(s => s.id !== id));
  }

  function updateTimeSlot(id: string, field: keyof Omit<TimeSlotRow, "id">, value: string) {
    setTimeSlots(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  }

  function cycleSlotColor(id: string, currentColor: string) {
    const idx = SLOT_COLORS.indexOf(currentColor);
    const next = SLOT_COLORS[(idx + 1) % SLOT_COLORS.length];
    updateTimeSlot(id, "color", next);
  }

  const totalSessions = selectedDates.size * timeSlots.length;
  const canCreate = selectedDates.size > 0 && !!brandId;
  const selectedBrand = brands.find(b => b.id === brandId);

  async function createAll() {
    if (!canCreate) return;
    setSaving(true);
    const sessions: object[] = [];
    for (const dateStr of Array.from(selectedDates).sort()) {
      for (const ts of timeSlots) {
        const endTime = calcEndTime(ts.startTime, ts.durationH);
        sessions.push({
          brandId, platform,
          slotColor: ts.color,
          scheduledStart: toMYT(`${dateStr}T${ts.startTime}`),
          scheduledEnd:   toMYT(`${dateStr}T${endTime}`),
          isCampaignDay: false, notes: "",
        });
      }
    }
    const res = await fetch("/api/sessions/bulk", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      setResult({ created: data.created, errors: data.errors ?? [] });
      onCreated();
    } else {
      alert(`Error: ${data.error}`);
    }
  }

  if (result) {
    return (
      <Modal open onClose={onClose} title="Manual Slot — Done" size="lg">
        <div className="space-y-4 py-2">
          <div className="text-center">
            <div className="text-3xl font-bold mb-1" style={{ color: "var(--accent)" }}>{result.created}</div>
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>session{result.created !== 1 ? "s" : ""} created</div>
          </div>
          {result.errors.length > 0 && (
            <div className="rounded-lg p-3 text-xs space-y-1" style={{ background: "var(--bg-subtle)", color: "var(--text-muted)" }}>
              <div className="font-semibold mb-1">Skipped:</div>
              {result.errors.map((e, i) => <div key={i}>• {e}</div>)}
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Manual Slot" size="xl">
      <div className="space-y-4">

        {/* ── Shared config ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Brand *</label>
            <Select value={brandId} onChange={e => setBrandId(e.target.value)}>
              <option value="">Select brand…</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Platform</label>
            <Select value={platform} onChange={e => setPlatform(e.target.value)}>
              <option value="TIKTOK">TikTok</option>
              <option value="SHOPEE">Shopee</option>
            </Select>
          </div>
        </div>

        {/* ── Time slots ────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
              Time Slots <span className="font-normal" style={{ color: "var(--text-muted)" }}>— applied to every selected day</span>
            </label>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {timeSlots.length} slot{timeSlots.length !== 1 ? "s" : ""}
            </span>
          </div>

          {timeSlots.map((ts, idx) => {
            const endTime = calcEndTime(ts.startTime, ts.durationH);
            return (
              <div key={ts.id} className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
                <button
                  onClick={() => cycleSlotColor(ts.id, ts.color)}
                  title="Click to change color"
                  className="w-4 h-4 rounded-full flex-shrink-0 cursor-pointer transition-transform hover:scale-110"
                  style={{ background: ts.color, border: "2px solid rgba(255,255,255,0.3)" }}
                />
                <div className="flex items-center gap-2 flex-1">
                  <div className="flex-1 min-w-0">
                    <label className="block text-[10px] mb-0.5" style={{ color: "var(--text-muted)" }}>Start</label>
                    <Input type="time" value={ts.startTime}
                      onChange={e => updateTimeSlot(ts.id, "startTime", e.target.value)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="block text-[10px] mb-0.5" style={{ color: "var(--text-muted)" }}>Duration</label>
                    <Select value={ts.durationH}
                      onChange={e => updateTimeSlot(ts.id, "durationH", e.target.value)}>
                      {[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8].map(n => (
                        <option key={n} value={n}>{n}h</option>
                      ))}
                    </Select>
                  </div>
                  <span className="text-[11px] flex-shrink-0 pt-4" style={{ color: "var(--text-muted)" }}>
                    → {endTime}
                  </span>
                </div>
                <button
                  onClick={() => removeTimeSlot(ts.id)}
                  disabled={timeSlots.length === 1}
                  className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded cursor-pointer transition-opacity text-base leading-none"
                  style={{ opacity: timeSlots.length === 1 ? 0.2 : 0.5, color: "var(--text-muted)" }}
                  title="Remove time slot"
                >×</button>
              </div>
            );
          })}

          <button
            onClick={addTimeSlot}
            className="w-full py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors"
            style={{ border: "1px dashed var(--border)", color: "var(--text-muted)", background: "transparent" }}
          >
            + Add time slot
          </button>
        </div>

        {/* ── Calendar date picker ──────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
              Select Days
            </label>
            <div className="flex items-center gap-2">
              <Select value={month} onChange={e => { setMonth(Number(e.target.value)); setSelectedDates(new Set()); }}
                className="text-xs">
                {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </Select>
              <Input type="number" value={year} min={2024} max={2030} className="w-16 text-xs"
                onChange={e => { setYear(Number(e.target.value)); setSelectedDates(new Set()); }} />
              {selectedDates.size > 0 && (
                <button className="text-[11px] cursor-pointer" style={{ color: "var(--text-muted)" }}
                  onClick={() => setSelectedDates(new Set())}>Clear</button>
              )}
            </div>
          </div>

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
                    <div key={di} onClick={() => dateStr && toggleDate(dateStr)}
                      className="min-h-[44px] p-1.5 flex flex-col gap-0.5 transition-colors"
                      style={{
                        borderRight: di < 6 ? "1px solid var(--border)" : "none",
                        background: selected ? (selectedBrand ? selectedBrand.color + "20" : "var(--accent-light)") : !day ? "var(--bg-subtle)" : "transparent",
                        cursor: day ? "pointer" : "default",
                      }}>
                      {day && (
                        <>
                          <span className="text-[11px] font-medium leading-none"
                            style={{ color: selected ? (selectedBrand?.color || "var(--accent)") : "var(--text-secondary)" }}>
                            {format(day, "d")}
                          </span>
                          {selected && (
                            <span className="text-[9px] leading-tight font-medium"
                              style={{ color: selectedBrand?.color || "var(--accent)" }}>
                              ×{timeSlots.length}
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

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {selectedDates.size > 0 && timeSlots.length > 0
              ? `${selectedDates.size} day${selectedDates.size !== 1 ? "s" : ""} × ${timeSlots.length} slot${timeSlots.length !== 1 ? "s" : ""} = ${totalSessions} brand slot${totalSessions !== 1 ? "s" : ""}`
              : "Select days and configure time slots"}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={createAll} loading={saving} disabled={!canCreate}>
              <CalendarPlus size={13} /> Create {totalSessions} Session{totalSessions !== 1 ? "s" : ""}
            </Button>
          </div>
        </div>

      </div>
    </Modal>
  );
}

// ── Hours Tracker Panel ───────────────────────────────────────────────────────

function HoursTrackerPanel({
  data, loading, onRefresh, onTargetSaved,
}: {
  data: HoursData | null;
  loading: boolean;
  onRefresh: (month: number, year: number) => void;
  onTargetSaved: (month: number, year: number) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editType, setEditType] = useState<"HOST" | "BRAND">("HOST");
  const [editVal, setEditVal] = useState("");
  const [saving, setSaving] = useState(false);

  const now = new Date();
  const [month, setMonth] = useState<number>(data?.month ?? (now.getMonth() + 1));
  const [year, setYear] = useState<number>(data?.year ?? now.getFullYear());
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  async function saveTarget(type: "HOST" | "BRAND", id: string) {
    const hrs = parseFloat(editVal);
    if (isNaN(hrs) || hrs < 0) return;
    setSaving(true);
    await fetch("/api/hours-targets", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, referenceId: id, month, year, targetHours: hrs }),
    });
    setSaving(false);
    setEditingId(null);
    onTargetSaved(month, year);
  }

  function HoursRow({ row, type }: { row: HoursRow; type: "HOST" | "BRAND" }) {
    const pct = row.target > 0 ? Math.min(100, (row.scheduled / row.target) * 100) : 0;
    const isEditing = editingId === row.id && editType === type;
    const color = type === "BRAND" && row.color ? row.color : "var(--accent)";
    const overTarget = row.target > 0 && row.scheduled >= row.target;

    return (
      <div className="flex items-center gap-3 py-2 px-1" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {type === "BRAND" && row.color && (
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: row.color }} />
            )}
            <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
              {row.name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-subtle)", minWidth: 60 }}>
              {pct > 0 && (
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: overTarget ? "#22c55e" : color }} />
              )}
            </div>
            <span className="text-xs flex-shrink-0 font-medium tabular-nums"
              style={{ color: overTarget ? "#22c55e" : "var(--text-secondary)" }}>
              {row.scheduled}h{row.target > 0 ? ` / ${row.target}h` : ""}
            </span>
          </div>
        </div>
        {isEditing ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <Input
              type="number" value={editVal} min="0" step="1"
              onChange={e => setEditVal(e.target.value)}
              className="w-16 text-xs py-1"
              onKeyDown={e => { if (e.key === "Enter") saveTarget(type, row.id); if (e.key === "Escape") setEditingId(null); }}
              autoFocus
            />
            <Button size="sm" onClick={() => saveTarget(type, row.id)} loading={saving}>✓</Button>
            <button className="text-xs cursor-pointer px-1" style={{ color: "var(--text-muted)" }} onClick={() => setEditingId(null)}>✕</button>
          </div>
        ) : (
          <button
            className="text-[11px] px-2 py-0.5 rounded cursor-pointer flex-shrink-0 transition-colors"
            style={{ color: "var(--text-muted)", background: "var(--bg-subtle)" }}
            onClick={() => { setEditingId(row.id); setEditType(type); setEditVal(String(row.target || "")); }}
            title="Set target"
          >
            {row.target > 0 ? "Edit" : "Set target"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="section-card p-4 space-y-3 animate-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <BarChart2 size={14} style={{ color: "var(--accent)" }} />
          <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
            Monthly Hours Tracker
          </span>
          {data && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {months[(data.month ?? 1) - 1]} {data.year}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <>
              <Select value={month ?? data.month} onChange={e => setMonth(Number(e.target.value))} className="text-xs">
                {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </Select>
              <Input type="number" value={year ?? data.year} min={2024} max={2030}
                onChange={e => setYear(Number(e.target.value))} className="w-20 text-xs" />
            </>
          )}
          <Button size="sm" variant="secondary" onClick={() => onRefresh(month, year)} loading={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {loading && <div className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>Loading…</div>}

      {data && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Live Hosts</div>
            {data.hosts.length === 0 && <div className="text-xs" style={{ color: "var(--text-muted)" }}>No active hosts</div>}
            {data.hosts.map(row => <HoursRow key={row.id} row={row} type="HOST" />)}
          </div>
          <div>
            <div className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Brands</div>
            {data.brands.length === 0 && <div className="text-xs" style={{ color: "var(--text-muted)" }}>No brands</div>}
            {data.brands.map(row => <HoursRow key={row.id} row={row} type="BRAND" />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Daily Grid View ──────────────────────────────────────────────────────────

const TIME_SLOTS = [
  { label: "8am–10am",  start:  8, end: 10 },
  { label: "10am–12pm", start: 10, end: 12 },
  { label: "12pm–2pm",  start: 12, end: 14 },
  { label: "3pm–5pm",   start: 15, end: 17 },
  { label: "5pm–7pm",   start: 17, end: 19 },
  { label: "8pm–10pm",  start: 20, end: 22 },
  { label: "10pm–12am", start: 22, end: 24 },
  { label: "12am–2am",  start: 24, end: 26 },
];

function sessionOverlapsSlot(session: Session, slot: { start: number; end: number }): boolean {
  const d = new Date(session.scheduledStart);
  const myt = new Date(d.getTime() + 8 * 3600_000);
  let h = myt.getUTCHours() + myt.getUTCMinutes() / 60;
  // after midnight counts as 24+
  if (h < 4) h += 24;
  const endD = new Date(session.scheduledEnd);
  const endMyt = new Date(endD.getTime() + 8 * 3600_000);
  let eh = endMyt.getUTCHours() + endMyt.getUTCMinutes() / 60;
  if (eh < 4) eh += 24;
  return h < slot.end && eh > slot.start;
}

function DailyGridView({
  gridDate, setGridDate, sessions, rooms, hosts, brands: _brands, filterBrand, filterRoom, filterType, filterHost, onSessionClick, onAddSlot,
}: {
  gridDate: string;
  setGridDate: (d: string) => void;
  sessions: Session[];
  rooms: Room[];
  hosts: Host[];
  brands: Brand[];
  filterBrand: string;
  filterRoom: string;
  filterType: string;
  filterHost: string;
  onSessionClick: (s: Session) => void;
  onAddSlot: (roomId: string, start: string, end: string) => void;
}) {

  const dateObj = parseISO(gridDate);
  const dayLabel = format(dateObj, "d/M/yyyy EEEE");

  // Build a `YYYY-MM-DDTHH:mm` (MYT) string for a slot on the grid date.
  // Slots past midnight (h >= 24) advance to the next calendar day.
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

  // Sessions for this day
  const daySessions = sessions.filter((s) => {
    const d = new Date(s.scheduledStart);
    const myt = new Date(d.getTime() + 8 * 3600_000);
    const sessionDate = myt.toISOString().slice(0, 10);
    return sessionDate === gridDate &&
      (!filterHost || s.liveHostId === filterHost) &&
      (!filterBrand || s.brandId === filterBrand) &&
      (!filterRoom || s.roomId === filterRoom) &&
      (!filterType || ((s.liveHost as unknown as { type?: string } | null)?.type ?? "FULL_TIME") === filterType);
  });

  // Rooms to show (all rooms, optionally filtered)
  const sortedRooms = [...rooms].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
  );
  const allRoomsForDay = filterRoom ? sortedRooms.filter((r) => r.id === filterRoom) : sortedRooms;

  // When any filter is active, hide rooms and slots with no sessions
  const filtersActive = !!(filterHost || filterBrand || filterRoom || filterType);
  const visibleRooms = filtersActive
    ? allRoomsForDay.filter((r) => daySessions.some((s) => s.roomId === r.id))
    : allRoomsForDay;
  const activeSlots = filtersActive
    ? TIME_SLOTS.filter((slot) => daySessions.some((s) => sessionOverlapsSlot(s, slot)))
    : TIME_SLOTS;

  // Campaign sessions (isCampaignDay) — build per-slot set
  const campaignSessions = daySessions.filter((s) => s.isCampaignDay);

  // For each slot, check if any campaign session spans it
  function getCampaignForSlot(slot: typeof TIME_SLOTS[0]) {
    return campaignSessions.filter((s) => sessionOverlapsSlot(s, slot));
  }

  function getSessionForRoomSlot(roomId: string, slot: typeof TIME_SLOTS[0]): Session | null {
    return daySessions.find((s) => s.roomId === roomId && sessionOverlapsSlot(s, slot)) ?? null;
  }

  // Build unique brand groups for campaign banner
  const campaignBrandSlots: Record<string, Set<number>> = {};
  for (const s of campaignSessions) {
    activeSlots.forEach((slot, i) => {
      if (sessionOverlapsSlot(s, slot)) {
        const key = `${s.brandId}|${s.brand.name}|${s.brand.color}|${s.platform}`;
        if (!campaignBrandSlots[key]) campaignBrandSlots[key] = new Set();
        campaignBrandSlots[key].add(i);
      }
    });
  }

  const colWidth = 120;
  const labelWidth = 140;

  return (
    <div className="section-card p-4 space-y-3">
      {/* Date nav */}
      <div className="flex items-center gap-3">
        <button onClick={prevDay} className="p-1.5 rounded-lg border transition-all cursor-pointer"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
          <ChevronLeft size={15} />
        </button>
        <input
          type="date"
          value={gridDate}
          onChange={(e) => setGridDate(e.target.value)}
          className="px-3 py-1.5 rounded-lg border text-sm font-medium"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }}
        />
        <button onClick={nextDay} className="p-1.5 rounded-lg border transition-all cursor-pointer"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
          <ChevronRight size={15} />
        </button>
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{dayLabel}</span>
      </div>

      {/* Grid table or no-session message */}
      {(filtersActive && daySessions.length === 0) ? (() => {
        const selectedHost = filterHost ? hosts.find((h) => h.id === filterHost) : null;
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

          {/* Header row: slot numbers + time ranges */}
          <thead>
            <tr>
              <th style={{
                background: "var(--bg-subtle)", border: "1px solid var(--border)",
                padding: "6px 10px", textAlign: "left", fontSize: 11, color: "var(--text-muted)", fontWeight: 600,
              }}>
                Room / Date
              </th>
              {activeSlots.map((slot, i) => (
                <th key={i} style={{
                  background: "var(--bg-subtle)", border: "1px solid var(--border)",
                  padding: "6px 8px", textAlign: "center", fontSize: 11, color: "var(--text-muted)", fontWeight: 600,
                  whiteSpace: "nowrap",
                }}>
                  <div style={{ fontWeight: 700, color: "var(--text-secondary)" }}>Slot {TIME_SLOTS.indexOf(slot) + 1}</div>
                  <div>{slot.label}</div>
                </th>
              ))}
            </tr>
            {/* Campaign banner row */}
            {Object.keys(campaignBrandSlots).length > 0 && (
              <tr>
                <td style={{
                  background: "var(--bg-subtle)", border: "1px solid var(--border)",
                  padding: "4px 10px", fontSize: 11, color: "var(--text-muted)", fontWeight: 600,
                }}>Campaign</td>
                {activeSlots.map((_, i) => {
                  const entries = Object.entries(campaignBrandSlots).filter(([, slots]) => slots.has(i));
                  if (entries.length === 0) return (
                    <td key={i} style={{ border: "1px solid var(--border)", background: "var(--bg-subtle)" }} />
                  );
                  return (
                    <td key={i} style={{ border: "1px solid var(--border)", padding: 0, verticalAlign: "top" }}>
                      {entries.map(([key]) => {
                        const [, brandName, color, platform] = key.split("|");
                        const bg = color || "#888";
                        return (
                          <div key={key} style={{
                            background: bg, color: "#fff", fontSize: 10, fontWeight: 700,
                            padding: "3px 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {platform}: {brandName}
                          </div>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            )}
          </thead>

          <tbody>
            {visibleRooms.length === 0 && (
              <tr>
                <td colSpan={activeSlots.length + 1} style={{
                  padding: "24px", textAlign: "center", fontSize: 13, color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                }}>
                  No rooms configured
                </td>
              </tr>
            )}
            {visibleRooms.map((room) => {
              // Check if any session exists in this room today
              const roomSessions = daySessions.filter((s) => s.roomId === room.id);
              const brand = roomSessions[0]?.brand ?? null;
              const roomLabel = brand ? `${room.name} [${brand.name}]` : room.name;

              return (
                <React.Fragment key={room.id}>
                  {/* Room header row */}
                  <tr>
                    <td colSpan={activeSlots.length + 1} style={{
                      background: brand?.color ? `${brand.color}22` : "var(--bg-subtle)",
                      border: "1px solid var(--border)",
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: 700,
                      color: brand?.color ?? "var(--text-secondary)",
                    }}>
                      {roomLabel}
                    </td>
                  </tr>

                  {/* Store sub-row (brand) */}
                  <tr key={`store-${room.id}`}>
                    <td style={{
                      border: "1px solid var(--border)", padding: "4px 10px",
                      fontSize: 11, color: "var(--text-muted)", background: "var(--bg-subtle)",
                    }}>
                      Store
                    </td>
                    {activeSlots.map((slot, si) => {
                      const session = getSessionForRoomSlot(room.id, slot);
                      if (!session) return (
                        <td key={si}
                          title="Click to add session"
                          onClick={() => onAddSlot(room.id, slotDatetime(slot.start), slotDatetime(slot.end))}
                          style={{
                            border: "1px solid var(--border)", background: "var(--bg-card)",
                            cursor: "pointer", textAlign: "center", verticalAlign: "middle",
                          }}
                        >
                          <span style={{ fontSize: 14, color: "var(--text-muted)", opacity: 0.4, lineHeight: 1 }}>+</span>
                        </td>
                      );
                      const bg = session.brand.color || "#888";
                      return (
                        <td key={si} style={{
                          border: "1px solid var(--border)", padding: "3px 6px",
                          background: bg, cursor: "pointer", verticalAlign: "middle",
                        }}
                          onClick={() => onSessionClick(session)}
                        >
                          <div style={{ color: "#fff", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {session.brand.name}
                          </div>
                          <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 9 }}>
                            {session.platform}
                          </div>
                        </td>
                      );
                    })}
                  </tr>

                  {/* Host sub-row */}
                  <tr key={`host-${room.id}`}>
                    <td style={{
                      border: "1px solid var(--border)", padding: "4px 10px",
                      fontSize: 11, color: "var(--text-muted)", background: "var(--bg-subtle)",
                    }}>
                      Host
                    </td>
                    {activeSlots.map((slot, si) => {
                      const session = getSessionForRoomSlot(room.id, slot);
                      if (!session) return (
                        <td key={si}
                          title="Click to add session"
                          onClick={() => onAddSlot(room.id, slotDatetime(slot.start), slotDatetime(slot.end))}
                          style={{
                            border: "1px solid var(--border)", background: "var(--bg-card)",
                            cursor: "pointer", textAlign: "center", verticalAlign: "middle",
                          }}
                        >
                          <span style={{ fontSize: 14, color: "var(--text-muted)", opacity: 0.4, lineHeight: 1 }}>+</span>
                        </td>
                      );
                      const hostName = session.liveHost?.displayName ?? "—";
                      return (
                        <td key={si} style={{
                          border: "1px solid var(--border)", padding: "3px 6px",
                          background: "var(--bg-card)", cursor: "pointer", verticalAlign: "middle",
                        }}
                          onClick={() => onSessionClick(session)}
                        >
                          <div style={{ fontSize: 10, color: "var(--text-primary)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {hostName}
                          </div>
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
