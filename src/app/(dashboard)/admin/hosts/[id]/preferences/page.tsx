"use client";
import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, X, Clock, Star, CalendarOff, Save } from "lucide-react";
import Link from "next/link";
import { format, addDays, startOfMonth, endOfMonth } from "date-fns";

const COMMON_SLOTS = ["08:00","10:00","12:00","14:00","16:00","18:00","20:00","22:00"];

interface Brand { id: string; name: string; platform: string; color: string; }
interface HostInfo { id: string; displayName: string; user: { name: string }; }

export default function HostPreferencesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [host, setHost] = useState<HostInfo | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  const [preferredBrands, setPreferredBrands] = useState<string[]>([]);
  const [offDays, setOffDays] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Calendar for off-days picker — current + next month
  const now = new Date();
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calYear, setCalYear] = useState(now.getFullYear());

  useEffect(() => {
    Promise.all([
      fetch(`/api/hosts/${id}`).then(r => r.json()),
      fetch("/api/brands").then(r => r.json()),
      fetch(`/api/hosts/${id}/preferences`).then(r => r.json()),
    ]).then(([hostData, brandsData, prefsData]) => {
      // hostData might be the LiveHost record
      setHost(hostData);
      setBrands(brandsData);
      setSlots(prefsData.preferredSlots || []);
      setPreferredBrands(prefsData.preferredBrands || []);
      setOffDays(prefsData.offDays || []);
    });
  }, [id]);

  async function save() {
    setSaving(true);
    await fetch(`/api/hosts/${id}/preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferredSlots: slots, preferredBrands, offDays }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function toggleSlot(slot: string) {
    setSlots(s => s.includes(slot) ? s.filter(x => x !== slot) : [...s, slot].sort());
  }
  function toggleBrand(brandId: string) {
    setPreferredBrands(b => b.includes(brandId) ? b.filter(x => x !== brandId) : [...b, brandId]);
  }
  function toggleOffDay(dateStr: string) {
    setOffDays(d => d.includes(dateStr) ? d.filter(x => x !== dateStr) : [...d, dateStr].sort());
  }

  // Build calendar grid for current cal month
  const mStart = startOfMonth(new Date(calYear, calMonth));
  const mEnd = endOfMonth(new Date(calYear, calMonth));
  const calDays: (string | null)[] = [];
  const firstDow = mStart.getDay(); // 0=Sun
  for (let i = 0; i < firstDow; i++) calDays.push(null);
  let cur = mStart;
  while (cur <= mEnd) {
    calDays.push(format(cur, "yyyy-MM-dd"));
    cur = addDays(cur, 1);
  }

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

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

      {/* ── Preferred Time Slots ── */}
      <div className="section-card p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Clock size={14} style={{ color: "var(--accent)" }} />
          <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Preferred Start Times</h2>
        </div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Toggle the slots this host prefers to start livestreams. Auto-schedule will prioritise these.
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          {COMMON_SLOTS.map(slot => (
            <button
              key={slot}
              onClick={() => toggleSlot(slot)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-all"
              style={{
                background: slots.includes(slot) ? "var(--accent)" : "var(--bg-subtle)",
                color: slots.includes(slot) ? "#fff" : "var(--text-secondary)",
                border: slots.includes(slot) ? "none" : "1px solid var(--border)",
              }}
            >
              {slot}
            </button>
          ))}
        </div>
        {slots.length > 0 && (
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Selected: {slots.join(", ")}
          </div>
        )}
      </div>

      {/* ── Preferred Brands ── */}
      <div className="section-card p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Star size={14} style={{ color: "var(--accent)" }} />
          <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Preferred Brands</h2>
        </div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Auto-schedule will try to pair this host with these brands first.
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          {brands.map(b => {
            const selected = preferredBrands.includes(b.id);
            return (
              <button
                key={b.id}
                onClick={() => toggleBrand(b.id)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all"
                style={{
                  background: selected ? b.color : "var(--bg-subtle)",
                  color: selected ? "#fff" : "var(--text-secondary)",
                  border: selected ? "none" : "1px solid var(--border)",
                }}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: selected ? "rgba(255,255,255,0.5)" : b.color }} />
                {b.name}
                {selected && <X size={10} />}
              </button>
            );
          })}
        </div>
        {preferredBrands.length > 0 && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {preferredBrands.length} brand(s) selected
          </p>
        )}
      </div>

      {/* ── Off Days ── */}
      <div className="section-card p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <CalendarOff size={14} style={{ color: "var(--danger)" }} />
          <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Off Days</h2>
        </div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Click dates to mark as unavailable. Auto-schedule will skip these days for this host.
        </p>

        {/* Month nav */}
        <div className="flex items-center gap-3 mt-2">
          <button onClick={() => {
            if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
            else setCalMonth(m => m - 1);
          }} className="p-1 rounded cursor-pointer" style={{ color: "var(--text-muted)" }}>‹</button>
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {MONTHS[calMonth]} {calYear}
          </span>
          <button onClick={() => {
            if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
            else setCalMonth(m => m + 1);
          }} className="p-1 rounded cursor-pointer" style={{ color: "var(--text-muted)" }}>›</button>
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1 mt-1">
          {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
            <div key={d} className="text-center text-[10px] font-semibold py-1" style={{ color: "var(--text-muted)" }}>{d}</div>
          ))}
          {calDays.map((dateStr, i) => {
            if (!dateStr) return <div key={`empty-${i}`} />;
            const isOff = offDays.includes(dateStr);
            const day = Number(dateStr.split("-")[2]);
            return (
              <button
                key={dateStr}
                onClick={() => toggleOffDay(dateStr)}
                className="aspect-square rounded-lg text-xs font-medium cursor-pointer transition-all flex items-center justify-center"
                style={{
                  background: isOff ? "var(--danger)" : "var(--bg-subtle)",
                  color: isOff ? "#fff" : "var(--text-secondary)",
                }}
              >
                {day}
              </button>
            );
          })}
        </div>

        {offDays.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {offDays.map(d => (
              <span key={d} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                style={{ background: "var(--danger-light)", color: "var(--danger-text)", border: "1px solid var(--danger)" }}>
                {d}
                <button onClick={() => toggleOffDay(d)} className="cursor-pointer"><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={save} loading={saving}>
          <Save size={14} /> Save Preferences
        </Button>
        {saved && (
          <span className="text-sm font-medium" style={{ color: "var(--success)" }}>✓ Saved!</span>
        )}
      </div>
    </div>
  );
}
