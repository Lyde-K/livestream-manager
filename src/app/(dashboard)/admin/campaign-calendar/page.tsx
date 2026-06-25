"use client";
import { useState, useEffect } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO, isSameMonth } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { DatePicker } from "@/components/ui/date-picker";

interface Brand { id: string; name: string; color: string; }
interface Campaign {
  id: string; name: string; platform: string;
  startDate: string; endDate: string;
  month: number; year: number;
  brandId: string | null; notes: string | null;
  brand: Brand | null;
}

const PLATFORM_COLORS: Record<string, string> = {
  TIKTOK: "#010101",
  SHOPEE: "#EE4D2D",
  BOTH:   "#6366f1",
};
const PLATFORM_LABELS: Record<string, string> = {
  TIKTOK: "TikTok", SHOPEE: "Shopee", BOTH: "Both",
};

const EMPTY_FORM = { name: "", platform: "TIKTOK", startDate: "", endDate: "", brandId: "", notes: "" };

export default function CampaignCalendarPage() {
  const [viewDate, setViewDate] = useState(new Date());
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const month = viewDate.getMonth() + 1;
  const year  = viewDate.getFullYear();

  useEffect(() => {
    fetch("/api/brands").then(r => r.json()).then((d: Brand[]) => setBrands(d.filter(b => b.id)));
  }, []);

  useEffect(() => { loadCampaigns(); }, [month, year]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadCampaigns() {
    const res = await fetch(`/api/campaigns?month=${month}&year=${year}`, { cache: "no-store" });
    setCampaigns(await res.json());
  }

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, startDate: format(viewDate, "yyyy-MM-01"), endDate: format(viewDate, "yyyy-MM-01") });
    setError("");
    setOpen(true);
  }

  function openEdit(c: Campaign) {
    setEditing(c);
    setForm({
      name: c.name, platform: c.platform,
      startDate: c.startDate.slice(0, 10),
      endDate:   c.endDate.slice(0, 10),
      brandId:   c.brandId ?? "",
      notes:     c.notes ?? "",
    });
    setError("");
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) { setError("Campaign name is required"); return; }
    if (!form.startDate || !form.endDate) { setError("Start and end dates are required"); return; }
    if (form.startDate > form.endDate) { setError("End date must be on or after start date"); return; }

    // Enforce max 4 campaigns per platform per month (excluding current if editing)
    const existing = campaigns.filter(c =>
      c.platform === form.platform &&
      (!editing || c.id !== editing.id)
    );
    if (existing.length >= 4) {
      setError(`Maximum 4 campaign ranges per platform per month`);
      return;
    }

    setSaving(true);
    setError("");
    const url = editing ? `/api/campaigns/${editing.id}` : "/api/campaigns";
    const method = editing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, brandId: form.brandId || null }),
    });
    setSaving(false);
    if (!res.ok) { const d = await res.json(); setError(d.error ?? "Failed to save"); return; }
    setOpen(false);
    await loadCampaigns();
  }

  async function deleteCampaign(id: string) {
    if (!confirm("Delete this campaign?")) return;
    await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    await loadCampaigns();
  }

  // Build calendar grid
  const firstDay = startOfMonth(viewDate);
  const lastDay  = endOfMonth(viewDate);
  const days = eachDayOfInterval({ start: firstDay, end: lastDay });
  const startPad = getDay(firstDay); // 0=Sun

  function campaignsForDay(day: Date): Campaign[] {
    const d = format(day, "yyyy-MM-dd");
    return campaigns.filter(c => c.startDate.slice(0, 10) <= d && c.endDate.slice(0, 10) >= d);
  }

  // Group campaigns by platform for the list view
  const tiktokCampaigns = campaigns.filter(c => c.platform === "TIKTOK" || c.platform === "BOTH");
  const shopeeCampaigns = campaigns.filter(c => c.platform === "SHOPEE" || c.platform === "BOTH");

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Flag size={20} style={{ color: "var(--accent)" }} /> Campaign Calendar
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Manage campaign date ranges for TikTok and Shopee. Campaign days auto-apply when scheduling sessions.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus size={14} /> Add Campaign
        </Button>
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-3">
        <button onClick={() => setViewDate(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; })}
          className="p-1.5 rounded-lg border cursor-pointer transition-all"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
          <ChevronLeft size={16} />
        </button>
        <span className="text-base font-bold min-w-[140px] text-center" style={{ color: "var(--text-primary)" }}>
          {format(viewDate, "MMMM yyyy")}
        </span>
        <button onClick={() => setViewDate(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; })}
          className="p-1.5 rounded-lg border cursor-pointer transition-all"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
          <ChevronRight size={16} />
        </button>
        <button onClick={() => setViewDate(new Date())}
          className="px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-all"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
          Today
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Calendar */}
        <div className="lg:col-span-2 section-card p-4">
          <div className="grid grid-cols-7 text-center text-xs font-semibold mb-2"
            style={{ color: "var(--text-muted)" }}>
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}
            {days.map(day => {
              const dayCampaigns = campaignsForDay(day);
              const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
              return (
                <div key={day.toISOString()} className="min-h-[60px] rounded p-1"
                  style={{
                    background: isToday ? "color-mix(in oklab, var(--accent) 8%, var(--bg-card))" : "var(--bg-card)",
                    border: `1px solid ${isToday ? "var(--accent)" : "var(--border)"}`,
                  }}>
                  <div className="text-xs font-medium mb-1" style={{
                    color: isToday ? "var(--accent)" : "var(--text-secondary)",
                  }}>{format(day, "d")}</div>
                  {dayCampaigns.map(c => (
                    <div key={c.id} className="text-[9px] font-semibold truncate rounded px-1 mb-0.5"
                      style={{
                        background: PLATFORM_COLORS[c.platform] ?? "#888",
                        color: "#fff",
                      }}>
                      {c.name}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Campaign list */}
        <div className="space-y-4">
          {/* TikTok */}
          <div className="section-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full" style={{ background: PLATFORM_COLORS.TIKTOK }} />
              <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>TikTok Campaigns</span>
              <span className="ml-auto text-xs" style={{ color: "var(--text-muted)" }}>{tiktokCampaigns.length}/4</span>
            </div>
            {tiktokCampaigns.length === 0 && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>No TikTok campaigns this month</p>
            )}
            <div className="space-y-2">
              {tiktokCampaigns.map(c => <CampaignRow key={c.id} campaign={c} onEdit={openEdit} onDelete={deleteCampaign} />)}
            </div>
          </div>
          {/* Shopee */}
          <div className="section-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full" style={{ background: PLATFORM_COLORS.SHOPEE }} />
              <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Shopee Campaigns</span>
              <span className="ml-auto text-xs" style={{ color: "var(--text-muted)" }}>{shopeeCampaigns.length}/4</span>
            </div>
            {shopeeCampaigns.length === 0 && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>No Shopee campaigns this month</p>
            )}
            <div className="space-y-2">
              {shopeeCampaigns.map(c => <CampaignRow key={c.id} campaign={c} onEdit={openEdit} onDelete={deleteCampaign} />)}
            </div>
          </div>
        </div>
      </div>

      {/* Add / Edit Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Campaign" : "Add Campaign"} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Campaign Name *</label>
            <Input placeholder="e.g. 12.12 Mega Sale" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Platform *</label>
            <Select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
              <option value="TIKTOK">TikTok</option>
              <option value="SHOPEE">Shopee</option>
              <option value="BOTH">Both</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Start Date *</label>
              <DatePicker value={form.startDate} onChange={v => setForm({ ...form, startDate: v })} placeholder="Start date" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>End Date *</label>
              <DatePicker value={form.endDate} min={form.startDate || undefined} onChange={v => setForm({ ...form, endDate: v })} placeholder="End date" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Brand-specific <span style={{ color: "var(--text-muted)" }}>(optional — leave blank to apply to all brands)</span>
            </label>
            <Select value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}>
              <option value="">All brands</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Notes (optional)</label>
            <Input placeholder="e.g. Extra budget, hero SKU…" value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          {error && <p className="text-xs" style={{ color: "#ef4444" }}>{error}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>{editing ? "Save Changes" : "Add Campaign"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function CampaignRow({ campaign: c, onEdit, onDelete }: {
  campaign: Campaign;
  onEdit: (c: Campaign) => void;
  onDelete: (id: string) => void;
}) {
  const color = PLATFORM_COLORS[c.platform] ?? "#888";
  return (
    <div className="flex items-start gap-2 rounded-lg p-2.5" style={{ background: "var(--bg-subtle)" }}>
      <div className="w-2.5 h-2.5 rounded-full mt-0.5 flex-shrink-0" style={{ background: color }} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>{c.name}</div>
        <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {c.startDate.slice(0, 10)} → {c.endDate.slice(0, 10)}
        </div>
        {c.brand && (
          <div className="text-[10px] mt-0.5 flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: c.brand.color }} />
            <span style={{ color: "var(--text-muted)" }}>{c.brand.name}</span>
          </div>
        )}
        {c.notes && <div className="text-[10px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>{c.notes}</div>}
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <button onClick={() => onEdit(c)} className="p-1 rounded cursor-pointer" style={{ color: "var(--text-muted)" }}>
          <Pencil size={11} />
        </button>
        <button onClick={() => onDelete(c.id)} className="p-1 rounded cursor-pointer" style={{ color: "#ef4444" }}>
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}
