"use client";
import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ArrowLeft, Plus, X, Clock, Star, CalendarOff, Save, Flag } from "lucide-react";
import Link from "next/link";

const SCHEDULE_SLOTS = [
  { label: "8am–10am",   value: "8am-10am" },
  { label: "10am–12pm",  value: "10am-12pm" },
  { label: "12pm–2pm",   value: "12pm-2pm" },
  { label: "3pm–5pm",    value: "3pm-5pm" },
  { label: "5pm–7pm",    value: "5pm-7pm" },
  { label: "8pm–10pm",   value: "8pm-10pm" },
  { label: "10pm–12am",  value: "10pm-12am" },
  { label: "12am–2am",   value: "12am-2am" },
];

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Brand { id: string; name: string; platform: string; color: string; }
interface HostInfo { id: string; displayName: string; user: { name: string }; }

function SlotPicker({
  selected, max, onChange, label, description, accent,
}: {
  selected: string[];
  max: number;
  onChange: (val: string[]) => void;
  label: string;
  description: string;
  accent: string;
}) {
  function toggle(val: string) {
    if (selected.includes(val)) {
      onChange(selected.filter(x => x !== val));
    } else if (selected.length < max) {
      onChange([...selected, val]);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: accent }}>{label}</span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{selected.length} / {max} slots</span>
      </div>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{description}</p>
      <div className="flex flex-wrap gap-2">
        {SCHEDULE_SLOTS.map(slot => {
          const isSelected = selected.includes(slot.value);
          const isDisabled = !isSelected && selected.length >= max;
          return (
            <button
              key={slot.value}
              onClick={() => toggle(slot.value)}
              disabled={isDisabled}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: isSelected ? accent : "var(--bg-subtle)",
                color: isSelected ? "#fff" : isDisabled ? "var(--text-muted)" : "var(--text-secondary)",
                border: isSelected ? "none" : "1px solid var(--border)",
                cursor: isDisabled ? "not-allowed" : "pointer",
                opacity: isDisabled ? 0.45 : 1,
              }}
            >
              {slot.label}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          Selected: {selected.map(v => SCHEDULE_SLOTS.find(s => s.value === v)?.label ?? v).join(", ")}
        </div>
      )}
    </div>
  );
}

export default function HostPreferencesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [host, setHost] = useState<HostInfo | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [normalSlots, setNormalSlots] = useState<string[]>([]);
  const [campaignSlots, setCampaignSlots] = useState<string[]>([]);
  const [preferredBrands, setPreferredBrands] = useState<string[]>([]);
  const [offDays, setOffDays] = useState<number[]>([]);
  const [brandToAdd, setBrandToAdd] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/hosts/${id}`).then(r => r.json()),
      fetch("/api/brands").then(r => r.json()),
      fetch(`/api/hosts/${id}/preferences`).then(r => r.json()),
    ]).then(([hostData, brandsData, prefsData]) => {
      setHost(hostData);
      setBrands(brandsData);
      setNormalSlots(prefsData.normalSlots ?? []);
      setCampaignSlots(prefsData.campaignSlots ?? []);
      setPreferredBrands(prefsData.preferredBrands ?? []);
      const raw = prefsData.offDays ?? [];
      setOffDays(raw.filter((x: unknown) => typeof x === "number") as number[]);
    });
  }, [id]);

  function addBrand() {
    if (!brandToAdd || preferredBrands.includes(brandToAdd)) return;
    setPreferredBrands(b => [...b, brandToAdd]);
    setBrandToAdd("");
  }

  function removeBrand(bid: string) {
    setPreferredBrands(b => b.filter(x => x !== bid));
  }

  function toggleOffDay(dow: number) {
    setError("");
    if (offDays.includes(dow)) {
      setOffDays(d => d.filter(x => x !== dow));
    } else {
      if (offDays.length >= 2) { setError("Maximum 2 off days per week allowed."); return; }
      setOffDays(d => [...d, dow].sort((a, b) => a - b));
    }
  }

  async function save() {
    if (offDays.length < 1) { setError("Please select at least 1 off day per week."); return; }
    setError("");
    setSaving(true);
    await fetch(`/api/hosts/${id}/preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ normalSlots, campaignSlots, preferredBrands, offDays }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const availableBrands = brands.filter(b => !preferredBrands.includes(b.id));

  return (
    <div className="space-y-6 animate-in max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/hosts" className="p-1.5 rounded-lg transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-subtle)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            {host ? `${host.user?.name || host.displayName} — Preferences` : "Loading…"}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Preferred slots, brands &amp; off days used for auto-scheduling
          </p>
        </div>
      </div>

      {/* ── Preferred Slots ── */}
      <div className="section-card p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Clock size={14} style={{ color: "var(--accent)" }} />
          <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Preferred Slots</h2>
        </div>

        <SlotPicker
          selected={normalSlots}
          max={3}
          onChange={setNormalSlots}
          label="Regular Days — max 3 slots (6 hours)"
          description="Slots this host prefers on normal days. Auto-schedule will prioritise these."
          accent="var(--accent)"
        />

        <div className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-1.5 mb-3">
            <Flag size={12} style={{ color: "#f59e0b" }} />
            <span className="text-xs font-semibold" style={{ color: "#f59e0b" }}>Campaign Days</span>
          </div>
          <SlotPicker
            selected={campaignSlots}
            max={4}
            onChange={setCampaignSlots}
            label="Campaign Days — max 4 slots (8 hours)"
            description="Slots allowed on campaign days. Can extend to 4 slots to maximise campaign output."
            accent="#f59e0b"
          />
        </div>
      </div>

      {/* ── Preferred Brands ── */}
      <div className="section-card p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Star size={14} style={{ color: "var(--accent)" }} />
          <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Preferred Brands</h2>
        </div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Auto-schedule will try to pair this host with these brands first. No limit.
        </p>

        <div className="flex gap-2 mt-2">
          <Select value={brandToAdd} onChange={e => setBrandToAdd(e.target.value)} className="flex-1">
            <option value="">Select a brand to add…</option>
            {["TIKTOK", "SHOPEE", "BOTH"].map(platform => {
              const group = availableBrands.filter(b => b.platform === platform);
              if (group.length === 0) return null;
              const label = platform === "TIKTOK" ? "TikTok" : platform === "SHOPEE" ? "Shopee" : "Both";
              return (
                <optgroup key={platform} label={label}>
                  {group.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </optgroup>
              );
            })}
          </Select>
          <Button onClick={addBrand} disabled={!brandToAdd} variant="outline">
            <Plus size={14} /> Add
          </Button>
        </div>

        {preferredBrands.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>No preferred brands yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2 mt-1">
            {preferredBrands.map(bId => {
              const b = brands.find(x => x.id === bId);
              if (!b) return null;
              return (
                <span key={bId} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                  style={{ background: b.color, color: "#fff" }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40 flex-shrink-0" />
                  {b.name}
                  <button onClick={() => removeBrand(bId)} className="cursor-pointer opacity-80 hover:opacity-100">
                    <X size={10} />
                  </button>
                </span>
              );
            })}
          </div>
        )}
        {preferredBrands.length > 0 && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>{preferredBrands.length} brand(s) selected</p>
        )}
      </div>

      {/* ── Off Days ── */}
      <div className="section-card p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <CalendarOff size={14} style={{ color: "#ef4444" }} />
          <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Off Days</h2>
        </div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Recurring weekly off days. Max 2 per week, minimum 1. Auto-schedule skips these — except on the first 2 days of a campaign range.
        </p>

        <div className="flex gap-2 mt-3 flex-wrap">
          {DAYS_OF_WEEK.map((day, dow) => {
            const selected = offDays.includes(dow);
            const disabled = !selected && offDays.length >= 2;
            return (
              <button key={dow}
                onClick={() => !disabled && toggleOffDay(dow)}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: selected ? "#ef4444" : "var(--bg-subtle)",
                  color: selected ? "#fff" : disabled ? "var(--text-muted)" : "var(--text-secondary)",
                  border: selected ? "none" : "1px solid var(--border)",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.5 : 1,
                }}>
                {day}
              </button>
            );
          })}
        </div>

        {offDays.length > 0 && (
          <p className="text-sm font-medium mt-2" style={{ color: "#ef4444" }}>
            Off every {offDays.map(d => DAYS_OF_WEEK[d]).join(" & ")} each week
          </p>
        )}
        {error && <p className="text-xs font-medium" style={{ color: "#ef4444" }}>{error}</p>}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={save} loading={saving}>
          <Save size={14} /> Save Preferences
        </Button>
        {saved && <span className="text-sm font-medium" style={{ color: "var(--success)" }}>✓ Saved!</span>}
      </div>
    </div>
  );
}
