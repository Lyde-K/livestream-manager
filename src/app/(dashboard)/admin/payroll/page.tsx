"use client";
import { useState, useEffect } from "react";
import { Select } from "@/components/ui/select";
import { format } from "date-fns";
import {
  Clock, DollarSign, User, ChevronDown, ChevronRight,
  Banknote, Phone, CreditCard, TrendingUp, AlertCircle, CheckCircle2,
  Plus, Trash2, ShieldAlert, ToggleLeft, ToggleRight,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { HostMonthlyStats } from "@/lib/commission";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const FULL_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ─── Types ────────────────────────────────────────────────────────────────────

interface PayrollSession {
  id: string; brandName: string; platform: string;
  scheduledStart: string; actualDurationMinutes: number | null;
  isCampaignDay: boolean; gmv: number | null;
}

interface HostPayroll {
  hostId: string; displayName: string; hourlyRate: number;
  contactNo: string | null; icNo: string | null;
  bankName: string | null; bankAccount: string | null;
  totalSessions: number; totalMinutes: number; totalHours: number; totalPay: number;
  sessions: PayrollSession[];
}

interface Violation {
  id: string; hostId: string;
  brandId: string | null;
  brand: { id: string; name: string } | null;
  violationType: string; date: string; month: number; year: number;
  deductionAmount: number;
}

interface BonusOverride {
  attendanceGranted: boolean | null;
  punctualityGranted: boolean | null;
}

interface FTHostPayroll {
  hostId: string; displayName: string; hostName: string;
  contactNo: string | null; icNo: string | null;
  bankName: string | null; bankAccount: string | null;
  stats: HostMonthlyStats | null;
  violations: Violation[];
  bonusOverride: BonusOverride;
}

interface Brand { id: string; name: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMin(min: number | null) {
  if (!min) return "—";
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtMYR(val: number) { return `RM ${val.toFixed(2)}`; }

function resolveBonus(autoValue: boolean, override: boolean | null): boolean {
  return override !== null ? override : autoValue;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, icon: Icon, accent }: {
  label: string; value: string; icon: React.ElementType; accent?: boolean;
}) {
  return (
    <div className="section-card px-4 py-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: accent ? "var(--accent)" : "var(--bg-subtle)" }}>
        <Icon size={15} style={{ color: accent ? "#fff" : "var(--text-muted)" }} />
      </div>
      <div>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</div>
        <div className="text-lg font-bold" style={{ color: accent ? "var(--accent)" : "var(--text-primary)" }}>{value}</div>
      </div>
    </div>
  );
}

function Chip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-end">
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="font-semibold text-sm" style={{ color: accent ? "var(--success)" : "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

function BankDetail({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={13} style={{ color: "var(--text-muted)" }} className="flex-shrink-0" />
      <div>
        <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
        <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{value || "—"}</div>
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
      <div className="inline-block w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin mb-2" />
      <div>Loading…</div>
    </div>
  );
}

function KVCard({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-lg p-3" style={{ background: warn ? "var(--danger-light)" : "var(--bg-subtle)", border: warn ? "1px solid var(--danger)" : "1px solid var(--border)" }}>
      <div className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-lg font-bold" style={{ color: warn ? "var(--danger-text)" : "var(--text-primary)" }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

function TierBadge({ tier }: { tier: 0 | 1 | 2 }) {
  if (tier === 2) return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#22c55e20", color: "#22c55e" }}>Tier 2 ✓</span>;
  if (tier === 1) return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#f59e0b20", color: "#f59e0b" }}>Tier 1</span>;
  return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--bg-subtle)", color: "var(--text-muted)" }}>Below KPI</span>;
}

// ─── Bonus toggle button (3-state: auto / force-on / force-off) ───────────────
function BonusToggle({ label, autoEarned, value, onChange }: {
  label: string; autoEarned: boolean;
  value: boolean | null; onChange: (v: boolean | null) => void;
}) {
  const effective = resolveBonus(autoEarned, value);
  const isOverridden = value !== null;

  return (
    <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--bg-subtle)", border: `1px solid ${effective ? "var(--success)" : "var(--border)"}` }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{label}</span>
        {isOverridden && (
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#f59e0b20", color: "#f59e0b" }}>Admin override</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 text-sm font-bold" style={{ color: effective ? "var(--success)" : "var(--danger)" }}>
          {effective ? "Granted" : "Not granted"}
          {!isOverridden && <span className="ml-1 text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>(auto)</span>}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => onChange(true)}
            title="Force grant"
            className="px-2 py-1 rounded text-[10px] font-semibold transition-colors"
            style={{ background: value === true ? "#22c55e" : "var(--bg-card)", color: value === true ? "#fff" : "var(--text-muted)", border: "1px solid var(--border)" }}>
            Grant
          </button>
          <button
            onClick={() => onChange(false)}
            title="Force deny"
            className="px-2 py-1 rounded text-[10px] font-semibold transition-colors"
            style={{ background: value === false ? "var(--danger)" : "var(--bg-card)", color: value === false ? "#fff" : "var(--text-muted)", border: "1px solid var(--border)" }}>
            Deny
          </button>
          {isOverridden && (
            <button
              onClick={() => onChange(null)}
              title="Reset to auto"
              className="px-2 py-1 rounded text-[10px] font-semibold transition-colors"
              style={{ background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
              Auto
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Violation row ─────────────────────────────────────────────────────────────
function ViolationRow({ v, onDelete }: { v: Violation; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
      <ShieldAlert size={13} style={{ color: "var(--danger)", flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium" style={{ color: "var(--text)" }}>{v.violationType}</div>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          {v.brand?.name ?? "—"} · {v.date}
        </div>
      </div>
      <div className="text-sm font-semibold" style={{ color: "var(--danger)" }}>-RM{v.deductionAmount.toFixed(0)}</div>
      <button onClick={onDelete} className="p-1 rounded hover:bg-red-500/10 transition-colors">
        <Trash2 size={13} style={{ color: "var(--danger)" }} />
      </button>
    </div>
  );
}

// ─── Add Violation Form ────────────────────────────────────────────────────────
function AddViolationForm({ hostId, month, year, brands, onAdded }: {
  hostId: string; month: number; year: number;
  brands: Brand[];
  onAdded: (v: Violation) => void;
}) {
  const [brandId, setBrandId]       = useState("");
  const [type, setType]             = useState("");
  const [date, setDate]             = useState("");
  const [saving, setSaving]         = useState(false);

  async function submit() {
    if (!type || !date) return;
    setSaving(true);
    const res = await fetch("/api/payroll/violations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostId, brandId: brandId || null, violationType: type, date, month, year }),
    });
    if (res.ok) {
      const v = await res.json();
      onAdded(v);
      setType(""); setDate(""); setBrandId("");
    }
    setSaving(false);
  }

  return (
    <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Add Violation (−RM50 per entry)</div>
      <div className="grid grid-cols-3 gap-2">
        <select
          value={brandId}
          onChange={e => setBrandId(e.target.value)}
          className="rounded px-2 py-1.5 text-xs border w-full"
          style={{ background: "var(--bg-input, var(--bg-subtle))", borderColor: "var(--border)", color: "var(--text)" }}>
          <option value="">Brand (optional)</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input
          type="text" placeholder="Violation type"
          value={type} onChange={e => setType(e.target.value)}
          className="rounded px-2 py-1.5 text-xs border w-full"
          style={{ background: "var(--bg-input, var(--bg-subtle))", borderColor: "var(--border)", color: "var(--text)" }}
        />
        <input
          type="date" value={date} onChange={e => setDate(e.target.value)}
          className="rounded px-2 py-1.5 text-xs border w-full"
          style={{ background: "var(--bg-input, var(--bg-subtle))", borderColor: "var(--border)", color: "var(--text)" }}
        />
      </div>
      <button
        onClick={submit} disabled={saving || !type || !date}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-50 transition-opacity"
        style={{ background: "var(--danger)" }}>
        <Plus size={12} /> {saving ? "Adding…" : "Add Violation"}
      </button>
    </div>
  );
}

// ─── Part-Time Tab ─────────────────────────────────────────────────────────────

function PartTimeTab({ month, year }: { month: number; year: number }) {
  const [data, setData] = useState<HostPayroll[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/payroll?month=${month}&year=${year}`)
      .then(r => r.json())
      .then(j => { setData(Array.isArray(j) ? j : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [month, year]);

  const grandTotal = data.reduce((s, h) => s + h.totalPay, 0);
  const totalHours = data.reduce((s, h) => s + h.totalHours, 0);
  const totalSessions = data.reduce((s, h) => s + h.totalSessions, 0);

  if (loading) return <LoadingSpinner />;
  if (data.length === 0) return <div className="section-card empty-state">No part-time sessions recorded for this period.</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Total Sessions" value={String(totalSessions)} icon={Clock} />
        <SummaryCard label="Total Hours" value={`${totalHours.toFixed(1)}h`} icon={Clock} />
        <SummaryCard label="Total Payroll" value={fmtMYR(grandTotal)} icon={DollarSign} accent />
      </div>
      <div className="space-y-3">
        {data.map((host) => (
          <div key={host.hostId} className="section-card overflow-hidden">
            <div
              className="px-5 py-4 flex items-center gap-4 cursor-pointer transition-colors"
              onClick={() => setExpanded(expanded === host.hostId ? null : host.hostId)}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                style={{ background: "var(--accent-light)", color: "var(--accent-text)" }}>
                {host.displayName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{host.displayName}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>Part-time · RM{host.hourlyRate}/hr</div>
              </div>
              <div className="hidden sm:flex items-center gap-4 text-xs">
                <Chip label="Sessions" value={String(host.totalSessions)} />
                <Chip label="Hours" value={`${host.totalHours.toFixed(2)}h`} />
                <Chip label="Amount Due" value={fmtMYR(host.totalPay)} accent={host.totalPay > 0} />
              </div>
              {expanded === host.hostId ? <ChevronDown size={16} style={{ color: "var(--text-muted)" }} className="flex-shrink-0" /> : <ChevronRight size={16} style={{ color: "var(--text-muted)" }} className="flex-shrink-0" />}
            </div>
            {expanded === host.hostId && (
              <div style={{ borderTop: "1px solid var(--border)" }}>
                <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-3" style={{ background: "var(--bg-subtle)" }}>
                  <BankDetail icon={Phone} label="Contact" value={host.contactNo} />
                  <BankDetail icon={CreditCard} label="IC No" value={host.icNo} />
                  <BankDetail icon={Banknote} label="Bank" value={host.bankName && host.bankAccount ? `${host.bankName} · ${host.bankAccount}` : host.bankName || "—"} />
                </div>
                {host.sessions.length === 0 ? (
                  <div className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>No completed sessions this period.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead><tr><th>Date</th><th>Brand</th><th>Platform</th><th>Type</th><th className="text-right">Duration</th><th className="text-right">GMV</th><th className="text-right">Pay</th></tr></thead>
                      <tbody>
                        {host.sessions.map((s) => {
                          const hrs = (s.actualDurationMinutes || 0) / 60;
                          const pay = hrs * host.hourlyRate;
                          return (
                            <tr key={s.id}>
                              <td className="whitespace-nowrap">{format(new Date(s.scheduledStart), "dd MMM yyyy")}</td>
                              <td className="font-medium">{s.brandName}</td>
                              <td><span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                style={{ background: s.platform === "TIKTOK" ? "rgba(0,0,0,0.08)" : "rgba(238,77,45,0.12)", color: s.platform === "TIKTOK" ? "var(--text-primary)" : "#ee4d2d" }}>{s.platform}</span></td>
                              <td><span className="text-xs" style={{ color: s.isCampaignDay ? "var(--warning)" : "var(--text-muted)" }}>{s.isCampaignDay ? "Campaign" : "BAU"}</span></td>
                              <td className="text-right tabular-nums">{fmtMin(s.actualDurationMinutes)}</td>
                              <td className="text-right tabular-nums">{s.gmv != null ? `RM ${s.gmv.toFixed(0)}` : "—"}</td>
                              <td className="text-right tabular-nums font-semibold" style={{ color: "var(--success)" }}>{fmtMYR(pay)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: "2px solid var(--border)" }}>
                          <td colSpan={4} className="font-semibold" style={{ color: "var(--text-primary)" }}>Total</td>
                          <td className="text-right font-semibold tabular-nums">{fmtMin(host.totalMinutes)}</td>
                          <td />
                          <td className="text-right font-bold tabular-nums text-base" style={{ color: "var(--success)" }}>{fmtMYR(host.totalPay)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Full-Time Commission Tab ──────────────────────────────────────────────────

function FullTimeTab({ month, year }: { month: number; year: number }) {
  const [data, setData] = useState<FTHostPayroll[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  // per-host local state for violations and overrides (to avoid full reload)
  const [violationsMap, setViolationsMap] = useState<Record<string, Violation[]>>({});
  const [overridesMap,  setOverridesMap]  = useState<Record<string, BonusOverride>>({});
  const [savingOverride, setSavingOverride] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/payroll/fulltime?month=${month}&year=${year}`).then(r => r.json()),
      fetch("/api/brands").then(r => r.json()),
    ]).then(([ft, br]) => {
      const ftArr: FTHostPayroll[] = Array.isArray(ft) ? ft : [];
      setData(ftArr);
      const vm: Record<string, Violation[]> = {};
      const om: Record<string, BonusOverride> = {};
      for (const h of ftArr) {
        vm[h.hostId] = h.violations ?? [];
        om[h.hostId] = h.bonusOverride ?? { attendanceGranted: null, punctualityGranted: null };
      }
      setViolationsMap(vm);
      setOverridesMap(om);
      setBrands(Array.isArray(br) ? br : (br.brands ?? []));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [month, year]);

  async function saveOverride(hostId: string, attendanceGranted: boolean | null, punctualityGranted: boolean | null) {
    setSavingOverride(hostId);
    await fetch("/api/payroll/bonus-override", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostId, month, year, attendanceGranted, punctualityGranted }),
    });
    setOverridesMap(m => ({ ...m, [hostId]: { attendanceGranted, punctualityGranted } }));
    setSavingOverride(null);
  }

  async function deleteViolation(hostId: string, id: string) {
    await fetch(`/api/payroll/violations?id=${id}`, { method: "DELETE" });
    setViolationsMap(m => ({ ...m, [hostId]: (m[hostId] ?? []).filter(v => v.id !== id) }));
  }

  if (loading) return <LoadingSpinner />;
  if (data.length === 0) return <div className="section-card empty-state">No full-time hosts found.</div>;

  const hostsWithStats = data.filter(h => h.stats);
  const totalGMV = hostsWithStats.reduce((s, h) => s + (h.stats?.totalGMV ?? 0), 0);

  // Compute final net commission per host (with overrides + violations)
  function computeNet(h: FTHostPayroll): number {
    const s = h.stats;
    if (!s) return 0;
    const overrides = overridesMap[h.hostId] ?? h.bonusOverride;
    const violations = violationsMap[h.hostId] ?? h.violations ?? [];
    const autoAttendance   = s.hoursDeficit <= 0;
    const autoPunctuality  = s.lateSessions <= 5;
    const attBonus  = resolveBonus(autoAttendance,  overrides.attendanceGranted  ?? null) ? s.attendanceCommission  : 0;
    const punctBonus = resolveBonus(autoPunctuality, overrides.punctualityGranted ?? null) ? s.punctualityCommission : 0;
    const violationDeduction = violations.reduce((sum, v) => sum + v.deductionAmount, 0);
    return s.estimatedCommission + attBonus + punctBonus - violationDeduction;
  }

  const totalCommission = hostsWithStats.reduce((s, h) => s + computeNet(h), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Full-Time Hosts" value={String(data.length)} icon={User} />
        <SummaryCard label="Total GMV" value={formatCurrency(totalGMV)} icon={TrendingUp} />
        <SummaryCard label="Total Commission" value={formatCurrency(totalCommission)} icon={DollarSign} accent />
      </div>

      <div className="space-y-3">
        {data.map((host) => {
          const s = host.stats;
          const overrides  = overridesMap[host.hostId]  ?? host.bonusOverride;
          const violations = violationsMap[host.hostId] ?? host.violations ?? [];
          const netCommission = computeNet(host);
          const autoAttendance  = s ? s.hoursDeficit <= 0 : false;
          const autoPunctuality = s ? s.lateSessions <= 5  : false;
          const attEarned   = s ? resolveBonus(autoAttendance,  overrides.attendanceGranted  ?? null) : false;
          const punctEarned = s ? resolveBonus(autoPunctuality, overrides.punctualityGranted ?? null) : false;
          const violationTotal = violations.reduce((sum, v) => sum + v.deductionAmount, 0);

          return (
            <div key={host.hostId} className="section-card overflow-hidden">
              {/* Row header */}
              <div
                className="px-5 py-4 flex items-center gap-4 cursor-pointer transition-colors"
                onClick={() => setExpanded(expanded === host.hostId ? null : host.hostId)}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                  style={{ background: "var(--accent-light)", color: "var(--accent-text)" }}>
                  {host.displayName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{host.displayName}</div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>Full-time · {MONTHS[month-1]} {year}</div>
                </div>
                {s ? (
                  <div className="hidden sm:flex items-center gap-4 text-xs">
                    <Chip label="GMV" value={formatCurrency(s.totalGMV)} />
                    <Chip label="Hours" value={`${s.totalActualHours.toFixed(1)}/${s.requiredHours.toFixed(1)}h`} />
                    <Chip label="Late" value={String(s.lateSessions)} />
                    <div className="flex flex-col items-end">
                      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Commission</div>
                      <div className="font-semibold text-sm" style={{ color: "var(--success)" }}>{formatCurrency(netCommission)}</div>
                      {violationTotal > 0 && (
                        <div className="text-[10px]" style={{ color: "var(--danger)" }}>−{formatCurrency(violationTotal)} violations</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>No data</span>
                )}
                {expanded === host.hostId ? <ChevronDown size={16} style={{ color: "var(--text-muted)" }} className="flex-shrink-0" /> : <ChevronRight size={16} style={{ color: "var(--text-muted)" }} className="flex-shrink-0" />}
              </div>

              {/* Expanded detail */}
              {expanded === host.hostId && (
                <div style={{ borderTop: "1px solid var(--border)" }}>
                  {/* Banking */}
                  <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-3" style={{ background: "var(--bg-subtle)" }}>
                    <BankDetail icon={Phone} label="Contact" value={host.contactNo} />
                    <BankDetail icon={CreditCard} label="IC No" value={host.icNo} />
                    <BankDetail icon={Banknote} label="Bank" value={host.bankName && host.bankAccount ? `${host.bankName} · ${host.bankAccount}` : host.bankName || "—"} />
                  </div>

                  {!s ? (
                    <div className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>No performance data for this period.</div>
                  ) : (
                    <div className="px-5 py-5 space-y-5">

                      {/* ── Commission summary card ── */}
                      <div className="metric-card-indigo rounded-xl p-5 text-white">
                        <div className="text-sm opacity-80 mb-1">Estimated Commission — {FULL_MONTHS[month-1]} {year}</div>
                        <div className="text-3xl font-bold mb-4">{formatCurrency(netCommission)}</div>
                        <div className="grid grid-cols-3 gap-3 text-sm">
                          {/* Base */}
                          <div className="bg-white/10 rounded-lg p-2.5 text-center">
                            <div className="opacity-70 text-xs mb-0.5">Base Commission</div>
                            <div className="font-semibold">{formatCurrency(s.estimatedCommission)}</div>
                          </div>
                          {/* Attendance Bonus */}
                          <div className={`rounded-lg p-2.5 text-center ${attEarned ? "bg-green-500/25" : "bg-white/10"}`}>
                            <div className="opacity-70 text-xs mb-0.5">Attendance Bonus</div>
                            <div className="font-semibold">
                              {attEarned ? `+${formatCurrency(s.attendanceCommission)}` : "—"}
                            </div>
                            {!attEarned && !autoAttendance && overrides.attendanceGranted === null && (
                              <div className="text-[10px] opacity-60 mt-0.5">
                                {s.hoursDeficit.toFixed(1)}h short
                              </div>
                            )}
                          </div>
                          {/* Punctuality Bonus */}
                          <div className={`rounded-lg p-2.5 text-center ${punctEarned ? "bg-green-500/25" : "bg-white/10"}`}>
                            <div className="opacity-70 text-xs mb-0.5">Punctuality Bonus</div>
                            <div className="font-semibold">
                              {punctEarned ? `+${formatCurrency(s.punctualityCommission)}` : "—"}
                            </div>
                            {!punctEarned && !autoPunctuality && overrides.punctualityGranted === null && (
                              <div className="text-[10px] opacity-60 mt-0.5">
                                {s.lateSessions} late sessions
                              </div>
                            )}
                          </div>
                        </div>
                        {violationTotal > 0 && (
                          <div className="mt-3 rounded-lg p-2.5 text-center text-sm bg-red-500/25">
                            <div className="opacity-70 text-xs mb-0.5">Violation Deductions</div>
                            <div className="font-semibold">−{formatCurrency(violationTotal)}</div>
                          </div>
                        )}
                      </div>

                      {/* ── Stats grid ── */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <KVCard label="Sessions" value={`${s.totalCompletedSessions}/${s.totalScheduledSessions}`} sub="completed" />
                        <KVCard
                          label="Hours"
                          value={`${s.totalActualHours.toFixed(1)}h`}
                          sub={`req ${s.requiredHours.toFixed(1)}h · deficit ${s.hoursDeficit.toFixed(1)}h`}
                          warn={s.hoursDeficit > 5}
                        />
                        <KVCard
                          label="Punctuality"
                          value={`${s.onTimeSessions + s.earlySessions}/${s.totalCompletedSessions}`}
                          sub={`${s.lateSessions} late · ${s.earlySessions} early`}
                          warn={s.lateSessions > 5}
                        />
                        <KVCard label="Total GMV" value={formatCurrency(s.totalGMV)} sub={`${s.totalCompletedSessions} sessions`} />
                      </div>

                      {/* ── Admin: Bonus Overrides ── */}
                      <div>
                        <div className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                          <ToggleRight size={14} /> Bonus Override <span className="text-[10px] font-normal px-1.5 py-0.5 rounded" style={{ background: "var(--bg-subtle)", color: "var(--text-muted)" }}>Admin only</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <BonusToggle
                            label="Attendance Bonus (+0.5% GMV)"
                            autoEarned={autoAttendance}
                            value={overrides.attendanceGranted ?? null}
                            onChange={v => saveOverride(host.hostId, v, overrides.punctualityGranted ?? null)}
                          />
                          <BonusToggle
                            label="Punctuality Bonus (+0.5% GMV)"
                            autoEarned={autoPunctuality}
                            value={overrides.punctualityGranted ?? null}
                            onChange={v => saveOverride(host.hostId, overrides.attendanceGranted ?? null, v)}
                          />
                        </div>
                        {savingOverride === host.hostId && (
                          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Saving…</div>
                        )}
                      </div>

                      {/* ── Admin: Violations ── */}
                      <div>
                        <div className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                          <ShieldAlert size={14} /> Violations <span className="text-[10px] font-normal px-1.5 py-0.5 rounded" style={{ background: "var(--bg-subtle)", color: "var(--text-muted)" }}>Admin only</span>
                        </div>
                        <div className="space-y-2">
                          {violations.length === 0 ? (
                            <div className="text-xs" style={{ color: "var(--text-muted)" }}>No violations recorded this month.</div>
                          ) : (
                            violations.map(v => (
                              <ViolationRow key={v.id} v={v} onDelete={() => deleteViolation(host.hostId, v.id)} />
                            ))
                          )}
                          <AddViolationForm
                            hostId={host.hostId} month={month} year={year} brands={brands}
                            onAdded={v => setViolationsMap(m => ({ ...m, [host.hostId]: [...(m[host.hostId] ?? []), v] }))}
                          />
                        </div>
                      </div>

                      {/* ── Per-brand breakdown ── */}
                      <div>
                        <div className="text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Commission by Brand</div>
                        {s.byBrand.length === 0 ? (
                          <div className="text-sm py-3 px-4 rounded-lg" style={{ background: "var(--bg-subtle)", color: "var(--text-muted)" }}>No sessions recorded this period.</div>
                        ) : (
                          <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--border)" }}>
                            <table className="data-table" style={{ minWidth: "820px" }}>
                              <thead>
                                <tr>
                                  <th>Brand</th>
                                  <th>Type</th>
                                  <th className="text-right">GMV</th>
                                  <th className="text-right">GMV/hr</th>
                                  <th className="text-right">T1 ≥</th>
                                  <th className="text-right">T2 ≥</th>
                                  <th className="text-right">Tier</th>
                                  <th className="text-right">Rate</th>
                                  <th className="text-right">Commission</th>
                                </tr>
                              </thead>
                              <tbody>
                                {s.byBrand.map((b) => {
                                  if (!b.kpiConfigFound) {
                                    return (
                                      <tr key={b.brandId}>
                                        <td className="font-medium" colSpan={9}>
                                          <span style={{ color: "var(--text-muted)" }}>{b.brandName}</span>
                                          <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--danger-light)", color: "var(--danger-text)" }}>No KPI config for this month</span>
                                        </td>
                                      </tr>
                                    );
                                  }
                                  const k1 = b.kpi1Rate, k2 = b.kpi2Rate;
                                  return (
                                    <>
                                      <tr key={`${b.brandId}-bau`}>
                                        <td rowSpan={2} style={{ verticalAlign: "middle", fontWeight: 500 }}>{b.brandName}</td>
                                        <td><span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>BAU</span></td>
                                        <td className="text-right">{b.normalDayGMVPerHour > 0 ? formatCurrency(b.totalGMV - (b.campaignDayGMVPerHour > 0 ? 0 : 0)) : "—"}</td>
                                        <td className="text-right font-semibold" style={{ color: b.bauTier > 0 ? "var(--success)" : "var(--text-secondary)" }}>
                                          {b.normalDayGMVPerHour > 0 ? formatCurrency(b.normalDayGMVPerHour) + "/h" : "—"}
                                        </td>
                                        <td className="text-right text-xs" style={{ color: "var(--text-muted)" }}>
                                          {b.tier1KpiNormal > 0 ? formatCurrency(b.tier1KpiNormal) : <span style={{ color: "var(--danger-text)" }}>not set</span>}
                                        </td>
                                        <td className="text-right text-xs" style={{ color: "var(--text-muted)" }}>
                                          {b.tier2KpiNormal > 0 ? formatCurrency(b.tier2KpiNormal) : "—"}
                                        </td>
                                        <td className="text-right"><TierBadge tier={b.bauTier} /></td>
                                        <td className="text-right text-xs" style={{ color: "var(--text-muted)" }}>
                                          {b.bauTier === 2 ? `${k1+k2}%` : b.bauTier === 1 ? `${k1}%` : "0%"}
                                        </td>
                                        <td className="text-right font-semibold" style={{ color: b.bauCommission > 0 ? "var(--success)" : "var(--text-muted)" }}>
                                          {formatCurrency(b.bauCommission)}
                                        </td>
                                      </tr>
                                      <tr key={`${b.brandId}-camp`}>
                                        <td><span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#f59e0b20", color: "#f59e0b" }}>Campaign</span></td>
                                        <td className="text-right text-xs" style={{ color: "var(--text-muted)" }}>—</td>
                                        <td className="text-right font-semibold" style={{ color: b.campTier > 0 ? "var(--success)" : "var(--text-secondary)" }}>
                                          {b.campaignDayGMVPerHour > 0 ? formatCurrency(b.campaignDayGMVPerHour) + "/h" : "—"}
                                        </td>
                                        <td className="text-right text-xs" style={{ color: "var(--text-muted)" }}>
                                          {b.tier1KpiCampaign > 0 ? formatCurrency(b.tier1KpiCampaign) : <span style={{ color: "var(--danger-text)" }}>not set</span>}
                                        </td>
                                        <td className="text-right text-xs" style={{ color: "var(--text-muted)" }}>
                                          {b.tier2KpiCampaign > 0 ? formatCurrency(b.tier2KpiCampaign) : "—"}
                                        </td>
                                        <td className="text-right"><TierBadge tier={b.campTier} /></td>
                                        <td className="text-right text-xs" style={{ color: "var(--text-muted)" }}>
                                          {b.campTier === 2 ? `${k1+k2}%` : b.campTier === 1 ? `${k1}%` : "0%"}
                                        </td>
                                        <td className="text-right font-semibold" style={{ color: b.campCommission > 0 ? "var(--success)" : "var(--text-muted)" }}>
                                          {formatCurrency(b.campCommission)}
                                        </td>
                                      </tr>
                                    </>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr style={{ borderTop: "2px solid var(--border)" }}>
                                  <td colSpan={7} className="font-semibold" style={{ color: "var(--text-primary)" }}>Net Commission</td>
                                  <td />
                                  <td className="text-right font-bold text-base" style={{ color: "var(--success)" }}>{formatCurrency(netCommission)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type PayrollTab = "parttime" | "fulltime";

export default function PayrollPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [activeTab, setActiveTab] = useState<PayrollTab>("parttime");

  return (
    <div className="space-y-5 animate-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Payroll</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Part-time host hours &amp; full-time host commission</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-28">
            {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </Select>
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24">
            {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
          </Select>
        </div>
      </div>

      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: "var(--bg-subtle)" }}>
        {([["parttime", "Part-Time Payroll"], ["fulltime", "Full-Time Commission"]] as [PayrollTab, string][]).map(([t, l]) => (
          <button key={t} onClick={() => setActiveTab(t)}
            className="px-4 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer"
            style={{ background: activeTab === t ? "var(--sidebar-active)" : "transparent", color: activeTab === t ? "#fff" : "var(--text-secondary)" }}>
            {l}
          </button>
        ))}
      </div>

      {activeTab === "parttime" && <PartTimeTab month={month} year={year} />}
      {activeTab === "fulltime" && <FullTimeTab month={month} year={year} />}
    </div>
  );
}
