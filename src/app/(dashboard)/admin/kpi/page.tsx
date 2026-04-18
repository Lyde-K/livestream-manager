"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Award, Info } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Host { id: string; displayName: string; user: { name: string }; }
interface Brand { id: string; name: string; platform: string; }
interface KPI {
  id: string; liveHostId: string; brandId: string; month: number; year: number;
  tier1KpiNormal: number; tier2KpiNormal: number; tier1KpiCampaign: number; tier2KpiCampaign: number;
  baseCommissionRate: number; tier1Rate: number; tier2Rate: number;
  liveHost: { user: { name: string }; displayName: string };
  brand: { name: string };
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function KPIPage() {
  const now = new Date();
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<KPI | null>(null);
  const [form, setForm] = useState({
    liveHostId: "", brandId: "", month: now.getMonth() + 1, year: now.getFullYear(),
    tier1KpiNormal: "", tier2KpiNormal: "", tier1KpiCampaign: "", tier2KpiCampaign: "",
    baseCommissionRate: "", tier1Rate: "", tier2Rate: "",
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    const [k, h, b] = await Promise.all([
      fetch(`/api/kpi?month=${month}&year=${year}`),
      fetch("/api/hosts"),
      fetch("/api/brands"),
    ]);
    setKpis(await k.json());
    setHosts(await h.json());
    setBrands(await b.json());
  }

  useEffect(() => { load(); }, [month, year]);

  function openCreate() {
    setEditing(null);
    setForm({ liveHostId: "", brandId: "", month, year, tier1KpiNormal: "", tier2KpiNormal: "", tier1KpiCampaign: "", tier2KpiCampaign: "", baseCommissionRate: "", tier1Rate: "", tier2Rate: "" });
    setOpen(true);
  }
  function openEdit(k: KPI) {
    setEditing(k);
    setForm({ liveHostId: k.liveHostId, brandId: k.brandId, month: k.month, year: k.year,
      tier1KpiNormal: String(k.tier1KpiNormal), tier2KpiNormal: String(k.tier2KpiNormal),
      tier1KpiCampaign: String(k.tier1KpiCampaign), tier2KpiCampaign: String(k.tier2KpiCampaign),
      baseCommissionRate: String(k.baseCommissionRate), tier1Rate: String(k.tier1Rate), tier2Rate: String(k.tier2Rate),
    });
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    const url = editing ? `/api/kpi/${editing.id}` : "/api/kpi";
    const method = editing ? "PUT" : "POST";
    const body = { ...form, tier1KpiNormal: Number(form.tier1KpiNormal), tier2KpiNormal: Number(form.tier2KpiNormal), tier1KpiCampaign: Number(form.tier1KpiCampaign), tier2KpiCampaign: Number(form.tier2KpiCampaign), baseCommissionRate: Number(form.baseCommissionRate), tier1Rate: Number(form.tier1Rate), tier2Rate: Number(form.tier2Rate) };
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false); setOpen(false); load();
  }

  return (
    <div className="space-y-5 animate-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>KPI Settings</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Set GMV/hour targets and commission rates per host, brand, and month
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-28">
            {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </Select>
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24">
            {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Button onClick={openCreate}><Plus size={14} /> Add KPI</Button>
        </div>
      </div>

      <div className="alert alert-info">
        <Info size={15} className="flex-shrink-0 mt-0.5" />
        <div>
          <strong>How KPI Tiers Work:</strong> Set Tier 1 &amp; Tier 2 GMV/hour thresholds for normal and campaign days separately.
          If the host&apos;s average GMV/hour (normal days) reaches Tier 2 → they earn the Tier 2 commission rate on total GMV.
          Tier 1 → Tier 1 rate. Below both → Base rate.
        </div>
      </div>

      <div className="section-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Host</th>
              <th>Brand</th>
              <th className="text-right">T1 KPI (Normal)</th>
              <th className="text-right">T2 KPI (Normal)</th>
              <th className="text-right">T1 KPI (Campaign)</th>
              <th className="text-right">Base %</th>
              <th className="text-right">T1 %</th>
              <th className="text-right">T2 %</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {kpis.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <div className="empty-state">
                    <Award size={24} className="mx-auto mb-2 opacity-40" />
                    No KPI configured for {MONTHS[month-1]} {year}
                  </div>
                </td>
              </tr>
            )}
            {kpis.map((k) => (
              <tr key={k.id}>
                <td className="font-medium">{k.liveHost.user.name}</td>
                <td style={{ color: "var(--text-secondary)" }}>{k.brand.name}</td>
                <td className="text-right" style={{ color: "var(--text-secondary)" }}>{formatCurrency(k.tier1KpiNormal)}/hr</td>
                <td className="text-right" style={{ color: "var(--text-secondary)" }}>{formatCurrency(k.tier2KpiNormal)}/hr</td>
                <td className="text-right" style={{ color: "var(--text-secondary)" }}>{formatCurrency(k.tier1KpiCampaign)}/hr</td>
                <td className="text-right"><Badge variant="secondary">{k.baseCommissionRate}%</Badge></td>
                <td className="text-right"><Badge variant="warning">{k.tier1Rate}%</Badge></td>
                <td className="text-right"><Badge variant="success">{k.tier2Rate}%</Badge></td>
                <td className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(k)}><Pencil size={12} /> Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit KPI" : "Add KPI Config"} size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Live Host</label>
              <Select value={form.liveHostId} onChange={(e) => setForm({...form, liveHostId: e.target.value})}>
                <option value="">Select host…</option>
                {hosts.map(h => <option key={h.id} value={h.id}>{h.user.name}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Brand</label>
              <Select value={form.brandId} onChange={(e) => setForm({...form, brandId: e.target.value})}>
                <option value="">Select brand…</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Month</label>
              <Select value={form.month} onChange={(e) => setForm({...form, month: Number(e.target.value)})}>
                {MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Year</label>
              <Select value={form.year} onChange={(e) => setForm({...form, year: Number(e.target.value)})}>
                {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
              </Select>
            </div>
          </div>

          <div className="pt-3" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Normal Days — GMV/hour Targets</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Tier 1 (RM/hr)</label>
                <Input type="number" value={form.tier1KpiNormal} onChange={(e) => setForm({...form, tier1KpiNormal: e.target.value})} placeholder="800" />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Tier 2 (RM/hr)</label>
                <Input type="number" value={form.tier2KpiNormal} onChange={(e) => setForm({...form, tier2KpiNormal: e.target.value})} placeholder="1500" />
              </div>
            </div>
          </div>

          <div className="pt-3" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Campaign Days — GMV/hour Targets</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Tier 1 (RM/hr)</label>
                <Input type="number" value={form.tier1KpiCampaign} onChange={(e) => setForm({...form, tier1KpiCampaign: e.target.value})} placeholder="2000" />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Tier 2 (RM/hr)</label>
                <Input type="number" value={form.tier2KpiCampaign} onChange={(e) => setForm({...form, tier2KpiCampaign: e.target.value})} placeholder="3500" />
              </div>
            </div>
          </div>

          <div className="pt-3" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Commission Rates (% of total GMV)</div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Base Rate (%)</label>
                <Input type="number" step="0.1" value={form.baseCommissionRate} onChange={(e) => setForm({...form, baseCommissionRate: e.target.value})} placeholder="1.0" />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Tier 1 Rate (%)</label>
                <Input type="number" step="0.1" value={form.tier1Rate} onChange={(e) => setForm({...form, tier1Rate: e.target.value})} placeholder="1.5" />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Tier 2 Rate (%)</label>
                <Input type="number" step="0.1" value={form.tier2Rate} onChange={(e) => setForm({...form, tier2Rate: e.target.value})} placeholder="2.0" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-4 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save KPI</Button>
        </div>
      </Modal>
    </div>
  );
}
