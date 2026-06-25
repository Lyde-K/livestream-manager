"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Filter, Mail, Sparkles, ChevronDown, ChevronUp, CalendarPlus, Wand2, Download, Upload, Clock, BarChart2, Users, Calendar, Trash2 } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Session, Room, Host, MONTHS_SHORT, formatMYT, sessionOverlapsSlot, TIME_SLOTS,
  DayDatePicker, MonthDatePicker, DailyListView, DailyGridView, ScheduleViewToggle,
} from "@/components/schedule/schedule-views";

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

interface Brand { id: string; name: string; color: string; platform: string; }

interface HoursRow { id: string; name: string; displayName?: string; color?: string; scheduled: number; target: number; }
interface HoursData { month: number; year: number; hosts: HoursRow[]; brands: HoursRow[]; }

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

// ─── Admin Export Modal ───────────────────────────────────────────────────────

type AdminRangeMode = "month" | "custom";

function buildAdminMonthOptions() {
  const opts: { label: string; value: string }[] = [];
  const now = new Date();
  for (let i = -6; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    opts.push({ label: format(d, "MMMM yyyy"), value: format(d, "yyyy-MM") });
  }
  return opts;
}
const ADMIN_MONTH_OPTIONS = buildAdminMonthOptions();
const ADMIN_CURRENT_MONTH = format(new Date(), "yyyy-MM");

function formatAdminBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AdminExportModal({ brands, onClose }: { brands: { id: string; name: string; color: string }[]; onClose: () => void }) {
  const [mode, setMode]               = useState<AdminRangeMode>("month");
  const [brandId, setBrandId]         = useState("");
  const [month, setMonth]             = useState(ADMIN_CURRENT_MONTH);
  const [customStart, setCustomStart] = useState(format(new Date(), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd]     = useState(format(new Date(), "yyyy-MM-dd"));
  const [preview, setPreview]         = useState<{ sessions: number; hours: number; estimatedBytes: number } | null>(null);
  const [previewing, setPreviewing]   = useState(false);
  const [exporting, setExporting]     = useState(false);

  function getBoundaries(): { start: string; end: string } | null {
    if (mode === "month") {
      const [y, m] = month.split("-").map(Number);
      return {
        start: format(new Date(y, m - 1, 1), "yyyy-MM-dd") + "T00:00:00+08:00",
        end:   format(new Date(y, m, 0),     "yyyy-MM-dd") + "T23:59:59+08:00",
      };
    }
    if (!customStart || !customEnd) return null;
    return {
      start: customStart + "T00:00:00+08:00",
      end:   customEnd   + "T23:59:59+08:00",
    };
  }

  const customRangeInvalid = mode === "custom" && customEnd < customStart;

  useEffect(() => {
    const bounds = getBoundaries();
    if (!bounds || customRangeInvalid) { setPreview(null); return; }
    setPreviewing(true);
    setPreview(null);
    const params = new URLSearchParams({ start: bounds.start, end: bounds.end });
    if (brandId) params.set("brandId", brandId);
    fetch(`/api/export/sessions/preview?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setPreview(d); setPreviewing(false); })
      .catch(() => setPreviewing(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, month, customStart, customEnd, brandId]);

  async function doExport() {
    const bounds = getBoundaries();
    if (!bounds) return;
    setExporting(true);
    const params = new URLSearchParams({ start: bounds.start, end: bounds.end });
    if (brandId) params.set("brandId", brandId);
    const res = await fetch(`/api/export/sessions?${params}`);
    setExporting(false);
    if (!res.ok) { alert("Export failed. Please try again."); return; }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const brandLabel = brandId ? (brands.find(b => b.id === brandId)?.name ?? "brand") : "all-brands";
    const rangeLabel = mode === "month"
      ? (ADMIN_MONTH_OPTIONS.find(m => m.value === month)?.label ?? month)
      : `${customStart}_${customEnd}`;
    a.href = url;
    a.download = `sessions-${brandLabel}-${rangeLabel}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  }

  const selStyle: React.CSSProperties = { background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "inherit" };
  const rangeLabel = mode === "month"
    ? ADMIN_MONTH_OPTIONS.find(m => m.value === month)?.label
    : (customStart && customEnd ? `${format(new Date(customStart + "T00:00:00"), "d MMM")} – ${format(new Date(customEnd + "T00:00:00"), "d MMM yyyy")}` : null);
  const selectedBrand = brands.find(b => b.id === brandId);
  const canExport = !exporting && !customRangeInvalid && (preview?.sessions ?? 0) > 0;

  return (
    <Modal open onClose={onClose} title="Export Sessions" size="md">
      <div className="space-y-5">

        {/* Optional brand filter */}
        <div>
          <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Brand <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional — leave blank for all)</span>
          </label>
          <select value={brandId} onChange={e => setBrandId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg text-sm" style={selStyle}>
            <option value="">All brands</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        {/* Range mode toggle */}
        <div>
          <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Date Range</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {(["month", "custom"] as AdminRangeMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                padding: "5px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit",
                background: mode === m ? "var(--accent)" : "var(--bg-subtle)",
                color: mode === m ? "#fff" : "var(--text-secondary)",
                transition: "all 0.15s",
              }}>
                {m === "month" ? "By Month" : "Custom Range"}
              </button>
            ))}
          </div>
          {mode === "month" ? (
            <select value={month} onChange={e => setMonth(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm" style={selStyle}>
              {ADMIN_MONTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>From</div>
                <DatePicker value={customStart} onChange={setCustomStart} placeholder="From" />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>To</div>
                <DatePicker value={customEnd} onChange={setCustomEnd} min={customStart || undefined} placeholder="To" />
              </div>
              {customRangeInvalid && (
                <p style={{ gridColumn: "1/-1", margin: 0, fontSize: 11, color: "#ef4444" }}>End date must be on or after start date.</p>
              )}
            </div>
          )}
        </div>

        {/* Preview panel */}
        <div style={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg-subtle)", overflow: "hidden", minHeight: 90 }}>
          {customRangeInvalid ? (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Fix the date range above</div>
          ) : previewing ? (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Calculating…</div>
          ) : preview ? (
            <div style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                {selectedBrand ? (
                  <><span style={{ width: 10, height: 10, borderRadius: "50%", background: selectedBrand.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{selectedBrand.name}</span></>
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>All brands</span>
                )}
                {rangeLabel && <><span style={{ fontSize: 12, color: "var(--text-muted)" }}>·</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{rangeLabel}</span></>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {[
                  { label: "Sessions", value: preview.sessions.toString(),          color: "#6366f1" },
                  { label: "Hours",    value: `${preview.hours}h`,                 color: "#F97316" },
                  { label: "Est. Size",value: formatAdminBytes(preview.estimatedBytes), color: "#22c55e" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ borderRadius: 10, background: "var(--bg-card)", border: "1px solid var(--border)", padding: "12px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>{value}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                  </div>
                ))}
              </div>
              {preview.sessions === 0 && (
                <p style={{ margin: "12px 0 0", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>No sessions found for this selection.</p>
              )}
            </div>
          ) : (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Select a date range to preview</div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={doExport} disabled={!canExport} loading={exporting}>
            <Download size={14} />
            {exporting ? "Exporting…" : "Export"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const { data: authSession } = useSession();
  const isAdmin = (authSession?.user as { role?: string })?.role === "ADMIN";
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
  const [clearOpen, setClearOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"calendar" | "grid" | "dailyList">("grid");
  const [gridDate, setGridDate] = useState(() => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10));

  async function loadMeta() {
    const [r, h, b] = await Promise.all([fetch("/api/rooms"), fetch("/api/hosts"), fetch("/api/brands")]);
    const roomData: Room[] = await r.json();
    setRooms(roomData.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })));
    setHosts(await h.json());
    setBrands(await b.json());
  }

  async function loadCampaigns(start: string, end: string) {
    // Slice to YYYY-MM to avoid timezone shifts when parsing +08:00 strings
    const [sy, sm] = start.slice(0, 7).split("-").map(Number);
    const [ey, em] = end.slice(0, 7).split("-").map(Number);
    const months: string[] = [];
    let y = sy, m = sm;
    while (y < ey || (y === ey && m <= em)) {
      months.push(`${y}-${m}`);
      m++; if (m > 12) { m = 1; y++; }
    }
    const all: typeof campaigns = [];
    await Promise.all(months.map(async (key) => {
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



  useEffect(() => { loadMeta(); }, []);
  useEffect(() => {
    if (viewMode === "grid" || viewMode === "dailyList") {
      const { start, end } = getGridRange();
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

  // Re-evaluate isCampaignDay whenever campaigns load or form date/brand/platform change
  useEffect(() => {
    if (!open || !form.scheduledStart || !form.brandId) return;
    const should = campaigns.some(c => {
      const d = form.scheduledStart.slice(0, 10);
      const start = c.startDate.slice(0, 10);
      const end   = c.endDate.slice(0, 10);
      if (d < start || d > end) return false;
      if (c.brandId && c.brandId !== form.brandId) return false;
      if (c.platform !== "BOTH" && c.platform !== form.platform) return false;
      return true;
    });
    if (should !== form.isCampaignDay) setForm(f => ({ ...f, isCampaignDay: should }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns, form.scheduledStart, form.brandId, form.platform, open]);

  function matchesTypeFilter(s: Session) {
    if (!filterType) return true;
    const hostType = (s.liveHost as unknown as { type?: string } | null)?.type ?? "FULL_TIME";
    return hostType === filterType;
  }

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
    const { start, end } = getGridRange();
    await loadSessions(start, end);
  }

  async function loadSuggestions() {
    setSuggestLoading(true);
    const d = parseISO(gridDate);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const params = new URLSearchParams({ month: String(month), year: String(year) });
    if (suggestFilter) params.set("brandId", suggestFilter);
    const res = await fetch(`/api/schedule/suggest?${params}`);
    setSuggestResult(await res.json());
    setSuggestLoading(false);
  }

  async function loadHours(month?: number, year?: number) {
    setHoursLoading(true);
    const d = parseISO(gridDate);
    const m = month ?? (d.getMonth() + 1);
    const y = year ?? d.getFullYear();
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

  function openAddSession() {
    setEditing(null);
    setForm({ roomId: "", liveHostId: "", brandId: "", platform: "TIKTOK", scheduledStart: "", scheduledEnd: "", isCampaignDay: false, notes: "" });
    setOpen(true);
  }

  function getGridRange() {
    const d = parseISO(gridDate);
    return {
      start: format(new Date(d.getFullYear(), d.getMonth(), 1), "yyyy-MM-dd") + "T00:00:00+08:00",
      end: format(new Date(d.getFullYear(), d.getMonth() + 1, 0), "yyyy-MM-dd") + "T23:59:59+08:00",
    };
  }

  async function exportMonthEmail() {
    setEmailLoading(true);
    const { start, end } = getGridRange();
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
    const { start, end } = getGridRange();
    const params = new URLSearchParams({ start, end });
    const res = await fetch(`/api/export/sessions?${params}`);
    if (!res.ok) { alert("Export failed"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sessions-${gridDate.slice(0, 7)}.xlsx`;
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
          <Button variant="outline" onClick={() => setAssignOpen(true)}            style={{ borderColor: "var(--accent-purple)", color: "var(--accent-purple)" }}>
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
          <Button variant="outline" onClick={() => setExportModalOpen(true)}>
            <Download size={14} /> Export Excel
          </Button>
          <Button variant="outline" onClick={() => { setImportOpen(true); setImportResult(null); setImportFile(null); }}>
            <Upload size={14} /> Import Excel
          </Button>
          <Button variant="outline" onClick={exportMonthEmail} loading={emailLoading}>
            <Mail size={14} /> Email to Clients
          </Button>
          {isAdmin && (
            <Button variant="outline" onClick={() => setClearOpen(true)}
              style={{ borderColor: "#ef4444", color: "#ef4444" }}>
              <Trash2 size={14} /> Clear Sessions
            </Button>
          )}
          <Button onClick={openAddSession}>
            <Plus size={14} /> Add Session
          </Button>
        </div>
        {/* Mobile action bar */}
        <div className="lg:hidden w-full space-y-2">
          {/* Primary row */}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={openAddSession}>
              <Plus size={14} /> Add Session
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setBulkOpen(true)}
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
              <Wand2 size={14} /> Auto-Schedule
            </Button>
          </div>
          {/* Secondary row */}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setAssignOpen(true)}              style={{ borderColor: "var(--accent-purple)", color: "var(--accent-purple)" }}>
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
              onClick={() => setExportModalOpen(true)}
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
          onRefresh={loadHours}
          onTargetSaved={loadHours}
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
      <ScheduleViewToggle viewMode={viewMode as "grid" | "dailyList"} setViewMode={setViewMode as (v: "grid" | "dailyList") => void} />

      {/* Daily Grid View */}
      {viewMode === "grid" && (
        <DailyGridView
          gridDate={gridDate}
          setGridDate={setGridDate}
          sessions={sessions}
          rooms={rooms}
          hosts={hosts}
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
          onPasteSlot={async (roomId, start, end, brand, host) => {
            await fetch("/api/sessions", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                roomId, brandId: brand.brandId, liveHostId: host.liveHostId ?? "",
                platform: brand.platform, isCampaignDay: brand.isCampaignDay,
                scheduledStart: toMYT(start), scheduledEnd: toMYT(end), notes: "",
              }),
            });
            await reloadCurrentRange();
          }}
          onUpdateSlot={async (sessionId, brand, host) => {
            const body: Record<string, unknown> = {};
            if (brand) { body.brandId = brand.brandId; body.platform = brand.platform; body.isCampaignDay = brand.isCampaignDay; }
            if (host)  { body.liveHostId = host.liveHostId; }
            await fetch(`/api/sessions/${sessionId}`, {
              method: "PUT", headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            await reloadCurrentRange();
          }}
        />
      )}

      {/* Daily List View */}
      {viewMode === "dailyList" && (
        <DailyListView
          gridDate={gridDate}
          setGridDate={setGridDate}
          sessions={sessions}
          filterHost={filterHost}
          filterBrand={filterBrand}
          filterRoom={filterRoom}
          filterType={filterType}
          is24h={is24h}
          onSessionClick={(s) => setDetailSession(s)}
        />
      )}


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
              <InfoRow label="Scheduled Start" value={formatMYT(detailSession.scheduledStart, is24h ? "dd MMM yyyy HH:mm" : "dd MMM yyyy h:mm a")} />
              <InfoRow label="Scheduled End"   value={formatMYT(detailSession.scheduledEnd,   is24h ? "HH:mm" : "h:mm a")} />
              <InfoRow label="Duration (scheduled)" value={(() => {
                const ms = new Date(detailSession.scheduledEnd).getTime() - new Date(detailSession.scheduledStart).getTime();
                const h = Math.floor(ms / 3600000);
                const m = Math.round((ms % 3600000) / 60000);
                return m > 0 ? `${h}h ${m}m` : `${h}h`;
              })()} />
              {detailSession.actualStart && <InfoRow label="Actual Start" value={formatMYT(detailSession.actualStart, is24h ? "HH:mm" : "h:mm a")} />}
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

      {/* Assign Hosts Modal */}
      {assignOpen && (
        <AssignHostsModal
          hosts={hosts}
          onClose={() => setAssignOpen(false)}
          onAssigned={() => { setAssignOpen(false); reloadCurrentRange(); }}
        />
      )}

      {/* Export Modal */}
      {exportModalOpen && (
        <AdminExportModal brands={brands} onClose={() => setExportModalOpen(false)} />
      )}

      {/* Clear Sessions Modal */}
      {clearOpen && (
        <ClearSessionsModal
          brands={brands}
          onClose={() => setClearOpen(false)}
          onCleared={() => { setClearOpen(false); reloadCurrentRange(); }}
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

interface SmartPreviewSession {
  date: string;
  dayOfWeek: string;
  slotValue: string;
  isCampaignDay: boolean;
  scheduledStart: string;
  scheduledEnd: string;
}

interface SmartSummary {
  totalSessions: number;
  totalHours: number;
  campaignDaySessions: number;
  regularDaySessions: number;
  hoursShortfall: number;
  strategy: string;
}

// legacy CalendarPreview uses this shape
interface PreviewSession {
  date: string;
  dayOfWeek: string;
  brandId: string;
  brandName: string;
  brandColor: string;
  scheduledStart: string;
  scheduledEnd: string;
  isCampaignDay?: boolean;
}

function BulkScheduleModal({ brands, rooms, onClose, onCreated }: BulkScheduleModalProps) {
  const now = new Date();
  const [brandId, setBrandId] = useState("");
  const [targetHours, setTargetHours] = useState("60");
  const [roomId, setRoomId] = useState(rooms[0]?.id || "");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [ignoredSlots, setIgnoredSlots] = useState<string[]>([]);
  const [slotToIgnore, setSlotToIgnore] = useState("");
  const [preview, setPreview] = useState<SmartPreviewSession[] | null>(null);
  const [summary, setSummary] = useState<SmartSummary | null>(null);
  const [autoPlatform, setAutoPlatform] = useState("");
  const [brandName, setBrandName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedBrand = brands.find(b => b.id === brandId);

  const ALL_SLOT_OPTIONS = [
    { label: "Slot 1 — 8am–10am",   value: "8am-10am" },
    { label: "Slot 2 — 10am–12pm",  value: "10am-12pm" },
    { label: "Slot 3 — 12pm–2pm",   value: "12pm-2pm" },
    { label: "Slot 4 — 3pm–5pm",    value: "3pm-5pm" },
    { label: "Slot 5 — 5pm–7pm",    value: "5pm-7pm" },
    { label: "Slot 6 — 8pm–10pm",   value: "8pm-10pm" },
    { label: "Slot 7 — 10pm–12am",  value: "10pm-12am" },
    { label: "Slot 8 — 12am–2am",   value: "12am-2am" },
  ];

  function addIgnoredSlot() {
    if (!slotToIgnore || ignoredSlots.includes(slotToIgnore) || ignoredSlots.length >= 2) return;
    setIgnoredSlots(s => [...s, slotToIgnore]);
    setSlotToIgnore("");
    setPreview(null); setSummary(null);
  }

  function removeIgnoredSlot(val: string) {
    setIgnoredSlots(s => s.filter(x => x !== val));
    setPreview(null); setSummary(null);
  }

  async function runPreview() {
    if (!brandId || !roomId || !targetHours) return;
    setError("");
    setLoading(true);
    setPreview(null);
    setSummary(null);
    const res = await fetch("/api/schedule/smart-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId, targetHours: Number(targetHours), roomId, month, year, ignoredSlots }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Failed to generate preview"); return; }
    setPreview(data.preview);
    setSummary(data.summary);
    setAutoPlatform(data.platform);
    setBrandName(data.brandName);
  }

  async function confirmCreate() {
    if (!preview || !brandId || !roomId) return;
    setSaving(true);
    const res = await fetch("/api/schedule/smart-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId, targetHours: Number(targetHours), roomId, month, year, ignoredSlots, confirm: true }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) { alert(`Created ${data.created} session(s) successfully!`); onCreated(); }
    else alert(`Error: ${data.error}`);
  }

  // Convert smart preview to CalendarPreview format
  const calPreview: PreviewSession[] = (preview ?? []).map(s => ({
    date: s.date,
    dayOfWeek: s.dayOfWeek,
    brandId,
    brandName: brandName || selectedBrand?.name || "",
    brandColor: selectedBrand?.color || "#6366f1",
    scheduledStart: s.scheduledStart,
    scheduledEnd: s.scheduledEnd,
    isCampaignDay: s.isCampaignDay,
  }));

  const tierLabel = Number(targetHours) >= 300 ? "300–400h tier: 12h/day all days"
    : Number(targetHours) >= 200 ? "200–299h tier: 12h campaign, 6h regular"
    : "60–199h tier: campaign-focused + historical best times";

  return (
    <Modal open onClose={onClose} title="Smart Auto-Schedule" size="xl">
      <div className="space-y-5">
        {/* Inputs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Brand *</label>
            <Select value={brandId} onChange={e => { setBrandId(e.target.value); setPreview(null); setSummary(null); }}>
              <option value="">Select brand…</option>
              {["TIKTOK","SHOPEE","BOTH"].map(p => {
                const group = brands.filter(b => b.platform === p);
                if (!group.length) return null;
                const lbl = p === "TIKTOK" ? "TikTok" : p === "SHOPEE" ? "Shopee" : "Both";
                return (
                  <optgroup key={p} label={lbl}>
                    {group.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </optgroup>
                );
              })}
            </Select>
            {selectedBrand && (
              <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                Platform: <strong>{selectedBrand.platform}</strong> (auto-detected)
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Target Hours *</label>
            <Input
              type="number" min={1} max={744} value={targetHours}
              onChange={e => { setTargetHours(e.target.value); setPreview(null); setSummary(null); }}
            />
            {targetHours && (
              <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>{tierLabel}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Room *</label>
            <Select value={roomId} onChange={e => { setRoomId(e.target.value); setPreview(null); }}>
              <option value="">Select room…</option>
              {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Month / Year *</label>
          <div className="flex gap-1.5">
            <Select value={month} onChange={e => { setMonth(Number(e.target.value)); setPreview(null); }} className="w-24">
              {MONTHS_SHORT.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </Select>
            <Input type="number" value={year} min={2024} max={2030}
              onChange={e => { setYear(Number(e.target.value)); setPreview(null); }} className="w-20" />
          </div>
        </div>

        {/* Ignore Slots */}
        <div className="space-y-2">
          <label className="block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            Ignore Slots <span className="font-normal" style={{ color: "var(--text-muted)" }}>(optional — max 2)</span>
          </label>
          <div className="flex gap-2">
            <Select value={slotToIgnore} onChange={e => setSlotToIgnore(e.target.value)} className="flex-1"
              disabled={ignoredSlots.length >= 2}>
              <option value="">Select a slot to ignore…</option>
              {ALL_SLOT_OPTIONS.filter(o => !ignoredSlots.includes(o.value)).map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
            <Button variant="outline" onClick={addIgnoredSlot} disabled={!slotToIgnore || ignoredSlots.length >= 2}>
              <Plus size={13} /> Add
            </Button>
          </div>
          {ignoredSlots.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {ignoredSlots.map(val => {
                const opt = ALL_SLOT_OPTIONS.find(o => o.value === val);
                return (
                  <span key={val} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                    style={{ background: "#ef444420", color: "#ef4444", border: "1px solid #ef444440" }}>
                    {opt?.label ?? val}
                    <button onClick={() => removeIgnoredSlot(val)} className="cursor-pointer opacity-80 hover:opacity-100">
                      <X size={10} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="text-xs font-medium" style={{ color: "#ef4444" }}>{error}</p>}

        <Button variant="secondary" onClick={runPreview} loading={loading} disabled={!brandId || !roomId || !targetHours}>
          <Sparkles size={13} /> Generate Smart Preview
        </Button>

        {/* Summary + preview */}
        {summary && (
          <div className="rounded-xl p-3 space-y-1" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
            <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Preview Summary</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
              <span>Sessions: <strong>{summary.totalSessions}</strong></span>
              <span>Total Hours: <strong>{summary.totalHours}h / {targetHours}h target</strong></span>
              <span>Campaign Days: <strong>{summary.campaignDaySessions}</strong></span>
              <span>Regular Days: <strong>{summary.regularDaySessions}</strong></span>
            </div>
            {summary.hoursShortfall > 0 && (
              <p className="text-[11px] font-medium mt-1" style={{ color: "#f59e0b" }}>
                ⚠ {summary.hoursShortfall}h shortfall — not enough days/slots in the month to reach target.
              </p>
            )}
            <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{summary.strategy}</p>
            {autoPlatform && (
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Platform: <strong>{autoPlatform}</strong> · Brand: <strong>{brandName}</strong>
              </p>
            )}
          </div>
        )}

        {preview && preview.length === 0 && (
          <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>No sessions could be generated. Check that full-time hosts are active and campaign data exists.</p>
        )}

        {preview && preview.length > 0 && (
          <div className="space-y-3">
            <SmartCalendarPreview month={month} year={year} sessions={calPreview} />
            {/* Per-slot breakdown */}
            <details className="text-xs">
              <summary className="cursor-pointer font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                View all {preview.length} sessions
              </summary>
              <div className="max-h-48 overflow-y-auto space-y-0.5 mt-1">
                {preview.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 py-0.5">
                    <span className="w-24 font-mono" style={{ color: "var(--text-muted)" }}>{s.date}</span>
                    <span style={{ color: "var(--text-secondary)" }}>{s.dayOfWeek}</span>
                    <span style={{ color: "var(--text-secondary)" }}>{s.slotValue}</span>
                    {s.isCampaignDay && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: "#f59e0b20", color: "#f59e0b" }}>Campaign</span>
                    )}
                  </div>
                ))}
              </div>
            </details>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button onClick={confirmCreate} loading={saving}>
                <CalendarPlus size={13} /> Create {preview.length} Sessions
              </Button>
            </div>
          </div>
        )}

        {!preview && !loading && (
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function SmartCalendarPreview({ month, year, sessions }: { month: number; year: number; sessions: PreviewSession[] }) {
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
                      <>
                        <span
                          className="rounded px-1 py-0.5 font-medium truncate leading-tight"
                          style={{ background: s.brandColor + "25", color: s.brandColor, fontSize: "10px" }}
                        >
                          {s.brandName.split(" ")[0]}
                        </span>
                        {s.isCampaignDay && (
                          <span className="rounded px-1 py-0.5 font-semibold leading-tight" style={{ background: "#f59e0b20", color: "#f59e0b", fontSize: "9px" }}>
                            Campaign
                          </span>
                        )}
                      </>
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

// ── Clear Sessions Modal ──────────────────────────────────────────────────────

const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function ClearSessionsModal({ brands, onClose, onCleared }: { brands: Brand[]; onClose: () => void; onCleared: () => void }) {
  const mytNow = new Date(Date.now() + 8 * 3_600_000);
  const mytM = mytNow.getUTCMonth() + 1;
  const mytY = mytNow.getUTCFullYear();
  const mytMonthStr = mytNow.toISOString().slice(0, 7);
  const livestreamBrands = brands.filter(b => (b as Brand & { hasLivestream?: boolean }).hasLivestream !== false);

  // Step 1: config; Step 2: confirm
  const [step, setStep] = useState<1 | 2>(1);

  const [brandId, setBrandId] = useState<string>("ALL");
  const [rangeType, setRangeType] = useState<"month" | "custom">("month");
  const [month, setMonth] = useState(mytM);
  const [year, setYear] = useState(mytY);
  const [customStart, setCustomStart] = useState(`${mytMonthStr}-01`);
  const [customEnd, setCustomEnd] = useState(`${mytMonthStr}-${String(new Date(mytY, mytM, 0).getDate()).padStart(2, "0")}`);
  const [deleting, setDeleting] = useState(false);

  const brandLabel = brandId === "ALL" ? "All Brands" : (brands.find(b => b.id === brandId)?.name ?? brandId);

  function dateRange(): { start: string; end: string } {
    if (rangeType === "month") {
      const d = new Date(year, month - 1, 1);
      return {
        start: `${format(startOfMonth(d), "yyyy-MM-dd")}T00:00:00+08:00`,
        end:   `${format(endOfMonth(d),   "yyyy-MM-dd")}T23:59:59+08:00`,
      };
    }
    return {
      start: `${customStart}T00:00:00+08:00`,
      end:   `${customEnd}T23:59:59+08:00`,
    };
  }

  function rangeLabel(): string {
    if (rangeType === "month") return `${MONTHS_FULL[month - 1]} ${year}`;
    return `${customStart} to ${customEnd}`;
  }

  async function doDelete() {
    setDeleting(true);
    const { start, end } = dateRange();
    const res = await fetch("/api/sessions/bulk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start, end, brandId: brandId === "ALL" ? null : brandId }),
    });
    const data = await res.json();
    setDeleting(false);
    if (res.ok) {
      alert(`Deleted ${data.deleted} session(s) for ${brandLabel} in ${rangeLabel()}.`);
      onCleared();
    } else {
      alert(`Error: ${data.error}`);
    }
  }

  if (step === 2) {
    return (
      <Modal open onClose={() => setStep(1)} title="Confirm Deletion" size="sm">
        <div className="space-y-4">
          <div className="rounded-xl p-4 space-y-2" style={{ background: "#ef444415", border: "1px solid #ef444440" }}>
            <p className="text-sm font-semibold" style={{ color: "#ef4444" }}>This cannot be undone.</p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              You are about to permanently delete all <strong>scheduled sessions</strong> for:
            </p>
            <ul className="text-sm space-y-1 ml-2" style={{ color: "var(--text-primary)" }}>
              <li>• Brand: <strong>{brandLabel}</strong></li>
              <li>• Period: <strong>{rangeLabel()}</strong></li>
            </ul>
            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
              Only PENDING and COMPLETED sessions within this date range will be removed.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>Go Back</Button>
            <Button onClick={doDelete} loading={deleting}
              style={{ background: "#ef4444", color: "#fff", borderColor: "#ef4444" }}>
              <Trash2 size={13} /> Yes, Delete Sessions
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Clear Sessions" size="md">
      <div className="space-y-4">
        {/* Brand */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Brand</label>
          <Select value={brandId} onChange={e => setBrandId(e.target.value)}>
            <option value="ALL">All Brands</option>
            {livestreamBrands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </div>

        {/* Range type */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Date Range</label>
          <div className="flex gap-2 mb-3">
            {(["month", "custom"] as const).map(t => (
              <button key={t} onClick={() => setRangeType(t)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={rangeType === t
                  ? { background: "var(--accent)", color: "#fff", border: "none" }
                  : { background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                {t === "month" ? "By Month" : "Custom Range"}
              </button>
            ))}
          </div>

          {rangeType === "month" ? (
            <div className="flex gap-2">
              <Select value={month} onChange={e => setMonth(Number(e.target.value))} className="flex-1">
                {MONTHS_FULL.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </Select>
              <Input type="number" value={year} min={2020} max={2030}
                onChange={e => setYear(Number(e.target.value))} className="w-24" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] mb-1" style={{ color: "var(--text-muted)" }}>From</label>
                <DatePicker value={customStart} onChange={setCustomStart} placeholder="From" />
              </div>
              <div>
                <label className="block text-[11px] mb-1" style={{ color: "var(--text-muted)" }}>To</label>
                <DatePicker value={customEnd} onChange={setCustomEnd} min={customStart || undefined} placeholder="To" />
              </div>
            </div>
          )}
        </div>

        {/* Summary preview */}
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>
          Will delete sessions for <strong>{brandLabel}</strong> from <strong>{rangeLabel()}</strong>.
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => setStep(2)}
            style={{ background: "#ef4444", color: "#fff", borderColor: "#ef4444" }}>
            <Trash2 size={13} /> Review & Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Assign Hosts Modal ────────────────────────────────────────────────────────

function AssignHostsModal({ hosts, onClose, onAssigned }: { hosts: Host[]; onClose: () => void; onAssigned: () => void }) {
  const now = new Date();
  const [hostType, setHostType] = useState<"FULL_TIME" | "PART_TIME">("FULL_TIME");
  const [specificHostId, setSpecificHostId] = useState<string>("ALL");
  const [rangeType, setRangeType] = useState<"month" | "custom">("month");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [customStart, setCustomStart] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(endOfMonth(now), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);

  const filteredHosts = hosts.filter(h => h.type === hostType);

  async function doAssign() {
    setSaving(true);
    const body: Record<string, unknown> = {
      hostType,
      ...(specificHostId !== "ALL" ? { hostId: specificHostId } : {}),
    };
    if (rangeType === "month") {
      body.month = month;
      body.year = year;
    } else {
      body.startDate = `${customStart}T00:00:00+08:00`;
      body.endDate   = `${customEnd}T23:59:59+08:00`;
      // Derive month/year from start for compat
      const d = new Date(customStart);
      body.month = d.getMonth() + 1;
      body.year  = d.getFullYear();
    }
    const res = await fetch("/api/schedule/assign-hosts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      const label = specificHostId !== "ALL"
        ? (hosts.find(h => h.id === specificHostId)?.user.name ?? specificHostId)
        : `All ${hostType === "FULL_TIME" ? "Full Time" : "Part Time"} Hosts`;
      alert(`Assigned ${data.assigned} of ${data.total ?? "?"} unassigned slot(s) to ${label}.`);
      onAssigned();
    } else {
      alert(`Error: ${data.error}`);
    }
  }

  return (
    <Modal open onClose={onClose} title="Assign Hosts" size="md">
      <div className="space-y-5">
        {/* Host Type */}
        <div>
          <label className="block text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Host Type</label>
          <div className="flex gap-2">
            {(["FULL_TIME", "PART_TIME"] as const).map(t => (
              <button key={t} onClick={() => { setHostType(t); setSpecificHostId("ALL"); }}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                style={hostType === t
                  ? { background: "var(--accent)", color: "#fff", border: "none" }
                  : { background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                {t === "FULL_TIME" ? "Full Time" : "Part Time"}
              </button>
            ))}
          </div>
        </div>

        {/* Host Selection */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Live Host</label>
          <Select value={specificHostId} onChange={e => setSpecificHostId(e.target.value)}>
            <option value="ALL">All {hostType === "FULL_TIME" ? "Full Time" : "Part Time"} Hosts</option>
            {filteredHosts.map(h => (
              <option key={h.id} value={h.id}>{h.user.name} ({h.displayName})</option>
            ))}
          </Select>
          {filteredHosts.length === 0 && (
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              No active {hostType === "FULL_TIME" ? "full time" : "part time"} hosts registered.
            </p>
          )}
        </div>

        {/* Date Range */}
        <div>
          <label className="block text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Date Range</label>
          <div className="flex gap-2 mb-3">
            {(["month", "custom"] as const).map(t => (
              <button key={t} onClick={() => setRangeType(t)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={rangeType === t
                  ? { background: "var(--accent)", color: "#fff", border: "none" }
                  : { background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                {t === "month" ? "By Month" : "Custom Range"}
              </button>
            ))}
          </div>
          {rangeType === "month" ? (
            <div className="flex gap-2">
              <Select value={month} onChange={e => setMonth(Number(e.target.value))} className="flex-1">
                {MONTHS_FULL.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </Select>
              <Input type="number" value={year} min={2020} max={2030}
                onChange={e => setYear(Number(e.target.value))} className="w-24" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] mb-1" style={{ color: "var(--text-muted)" }}>From</label>
                <DatePicker value={customStart} onChange={setCustomStart} placeholder="From" />
              </div>
              <div>
                <label className="block text-[11px] mb-1" style={{ color: "var(--text-muted)" }}>To</label>
                <DatePicker value={customEnd} onChange={setCustomEnd} min={customStart || undefined} placeholder="To" />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={doAssign} loading={saving}>
            <Users size={13} /> Assign Hosts
          </Button>
        </div>
      </div>
    </Modal>
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

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
              Time Slots <span className="font-normal" style={{ color: "var(--text-muted)" }}>— applied to every selected day</span>
            </label>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {timeSlots.length} slot{timeSlots.length !== 1 ? "s" : ""}
            </span>
          </div>
          {timeSlots.map((ts) => {
            const endTime = calcEndTime(ts.startTime, ts.durationH);
            return (
              <div key={ts.id} className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
                <button onClick={() => cycleSlotColor(ts.id, ts.color)} title="Click to change color"
                  className="w-4 h-4 rounded-full flex-shrink-0 cursor-pointer transition-transform hover:scale-110"
                  style={{ background: ts.color, border: "2px solid rgba(255,255,255,0.3)" }} />
                <div className="flex items-center gap-2 flex-1">
                  <div className="flex-1 min-w-0">
                    <label className="block text-[10px] mb-0.5" style={{ color: "var(--text-muted)" }}>Start</label>
                    <Input type="time" value={ts.startTime} onChange={e => updateTimeSlot(ts.id, "startTime", e.target.value)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="block text-[10px] mb-0.5" style={{ color: "var(--text-muted)" }}>Duration</label>
                    <Select value={ts.durationH} onChange={e => updateTimeSlot(ts.id, "durationH", e.target.value)}>
                      {[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8].map(n => (
                        <option key={n} value={n}>{n}h</option>
                      ))}
                    </Select>
                  </div>
                  <span className="text-[11px] flex-shrink-0 pt-4" style={{ color: "var(--text-muted)" }}>→ {endTime}</span>
                </div>
                <button onClick={() => removeTimeSlot(ts.id)} disabled={timeSlots.length === 1}
                  className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded cursor-pointer transition-opacity text-base leading-none"
                  style={{ opacity: timeSlots.length === 1 ? 0.2 : 0.5, color: "var(--text-muted)" }}>×</button>
              </div>
            );
          })}
          <button onClick={addTimeSlot}
            className="w-full py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors"
            style={{ border: "1px dashed var(--border)", color: "var(--text-muted)", background: "transparent" }}>
            + Add time slot
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Select Days</label>
            <div className="flex items-center gap-2">
              <Select value={month} onChange={e => { setMonth(Number(e.target.value)); setSelectedDates(new Set()); }} className="text-xs">
                {MONTHS_SHORT.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
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
            <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{row.name}</span>
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
            <Input type="number" value={editVal} min={0} max={744} step={0.5} className="w-16 text-xs"
              onChange={e => setEditVal(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveTarget(type, row.id); if (e.key === "Escape") setEditingId(null); }}
              autoFocus />
            <Button size="sm" onClick={() => saveTarget(type, row.id)} loading={saving}>✓</Button>
            <button onClick={() => setEditingId(null)} className="text-xs cursor-pointer" style={{ color: "var(--text-muted)" }}>✕</button>
          </div>
        ) : (
          <button onClick={() => { setEditingId(row.id); setEditType(type); setEditVal(String(row.target || "")); }}
            className="flex-shrink-0 text-xs cursor-pointer px-2 py-1 rounded"
            style={{ color: "var(--text-muted)", background: "var(--bg-subtle)" }}>
            Set target
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="section-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 size={16} style={{ color: "var(--accent)" }} />
          <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Hours Tracker</span>
        </div>
        <div className="flex items-center gap-2">
          <Select value={month} onChange={e => { setMonth(Number(e.target.value)); onRefresh(Number(e.target.value), year); }} className="text-xs">
            {MONTHS_SHORT.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </Select>
          <Input type="number" value={year} min={2024} max={2030} className="w-16 text-xs"
            onChange={e => { setYear(Number(e.target.value)); onRefresh(month, Number(e.target.value)); }} />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-6 text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>
      ) : !data ? null : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
              <Users size={12} /> Hosts
            </div>
            {data.hosts.length === 0
              ? <p className="text-xs" style={{ color: "var(--text-muted)" }}>No host data.</p>
              : data.hosts.map(row => <HoursRow key={row.id} row={row} type="HOST" />)}
          </div>
          <div>
            <div className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
              <BarChart2 size={12} /> Brands
            </div>
            {data.brands.length === 0
              ? <p className="text-xs" style={{ color: "var(--text-muted)" }}>No brand data.</p>
              : data.brands.map(row => <HoursRow key={row.id} row={row} type="BRAND" />)}
          </div>
        </div>
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

function PunctualityBadge({ status, punctuality }: { status: string; punctuality: string | null }) {
  if (status === "PENDING") return <Badge variant="secondary">Scheduled</Badge>;
  if (status === "MISSED") return <Badge variant="destructive">Missed</Badge>;
  if (punctuality === "EARLY") return <Badge variant="default">Early ✓</Badge>;
  if (punctuality === "ON_TIME") return <Badge variant="success">On Time ✓</Badge>;
  if (punctuality === "LATE") return <Badge variant="warning">Late</Badge>;
  return <Badge variant="success">Completed</Badge>;
}
