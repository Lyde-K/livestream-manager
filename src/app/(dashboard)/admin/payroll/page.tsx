"use client";
import { useState, useEffect } from "react";
import { Select } from "@/components/ui/select";
import { format } from "date-fns";
import {
  Clock, DollarSign, User, ChevronDown, ChevronRight,
  Banknote, Phone, CreditCard, TrendingUp, AlertCircle, CheckCircle2,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { HostMonthlyStats } from "@/lib/commission";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── Part-Time types ──────────────────────────────────────────────────────────

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

// ─── FT Commission types ──────────────────────────────────────────────────────

interface FTHostPayroll {
  hostId: string; displayName: string; hostName: string;
  contactNo: string | null; icNo: string | null;
  bankName: string | null; bankAccount: string | null;
  stats: HostMonthlyStats | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMin(min: number | null) {
  if (!min) return "—";
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtMYR(val: number) { return `RM ${val.toFixed(2)}`; }

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

// ─── Part-Time Tab ────────────────────────────────────────────────────────────

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

// ─── Full-Time Commission Tab ─────────────────────────────────────────────────

function FullTimeTab({ month, year }: { month: number; year: number }) {
  const [data, setData] = useState<FTHostPayroll[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/payroll/fulltime?month=${month}&year=${year}`)
      .then(r => r.json())
      .then(j => { setData(Array.isArray(j) ? j : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [month, year]);

  const hostsWithStats = data.filter(h => h.stats);
  const totalCommission = hostsWithStats.reduce((s, h) => s + (h.stats?.netCommission ?? 0), 0);
  const totalGMV = hostsWithStats.reduce((s, h) => s + (h.stats?.totalGMV ?? 0), 0);

  if (loading) return <LoadingSpinner />;
  if (data.length === 0) return <div className="section-card empty-state">No full-time hosts found.</div>;

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Full-Time Hosts" value={String(data.length)} icon={User} />
        <SummaryCard label="Total GMV" value={formatCurrency(totalGMV)} icon={TrendingUp} />
        <SummaryCard label="Total Commission" value={formatCurrency(totalCommission)} icon={DollarSign} accent />
      </div>

      <div className="space-y-3">
        {data.map((host) => {
          const s = host.stats;
          const hasDeductions = s && (s.hoursDeduction + s.punctualityDeduction) > 0;

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
                      <div className="font-semibold text-sm" style={{ color: "var(--success)" }}>{formatCurrency(s.netCommission)}</div>
                      {hasDeductions && (
                        <div className="text-[10px]" style={{ color: "var(--danger)" }}>-{formatCurrency(s.hoursDeduction + s.punctualityDeduction)}</div>
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
                      {/* Commission summary card */}
                      <div className="metric-card-indigo rounded-xl p-5 text-white">
                        <div className="text-sm opacity-80 mb-1">Estimated Commission — {MONTHS[month-1]} {year}</div>
                        <div className="text-3xl font-bold mb-4">{formatCurrency(s.netCommission)}</div>
                        <div className="grid grid-cols-3 gap-3 text-sm">
                          <div className="bg-white/10 rounded-lg p-2.5 text-center">
                            <div className="opacity-70 text-xs mb-0.5">Base Commission</div>
                            <div className="font-semibold">{formatCurrency(s.estimatedCommission)}</div>
                          </div>
                          <div className={`rounded-lg p-2.5 text-center ${s.hoursDeduction > 0 ? "bg-red-500/30" : "bg-white/10"}`}>
                            <div className="opacity-70 text-xs mb-0.5">Hours Deduction</div>
                            <div className="font-semibold">{s.hoursDeduction > 0 ? `-${formatCurrency(s.hoursDeduction)}` : "—"}</div>
                          </div>
                          <div className={`rounded-lg p-2.5 text-center ${s.punctualityDeduction > 0 ? "bg-red-500/30" : "bg-white/10"}`}>
                            <div className="opacity-70 text-xs mb-0.5">Punctuality Deduction</div>
                            <div className="font-semibold">{s.punctualityDeduction > 0 ? `-${formatCurrency(s.punctualityDeduction)}` : "—"}</div>
                          </div>
                        </div>
                      </div>

                      {/* Stats grid */}
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

                      {/* Deduction alerts */}
                      {s.hoursDeficit > 5 && (
                        <div className="alert alert-danger"><AlertCircle size={14} className="flex-shrink-0 mt-0.5" /><span>Hours deficit <strong>{s.hoursDeficit.toFixed(1)}h</strong> &gt; 5h → <strong>-0.5% deduction</strong></span></div>
                      )}
                      {s.lateSessions > 5 && (
                        <div className="alert alert-warning"><AlertCircle size={14} className="flex-shrink-0 mt-0.5" /><span><strong>{s.lateSessions} late sessions</strong> &gt; 5 → <strong>-0.5% deduction</strong></span></div>
                      )}

                      {/* Per-brand breakdown */}
                      {s.byBrand.length > 0 && (
                        <div>
                          <div className="text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Commission by Brand</div>
                          <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--border)" }}>
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Brand</th>
                                  <th className="text-right">Sessions</th>
                                  <th className="text-right">Hours</th>
                                  <th className="text-right">GMV</th>
                                  <th className="text-right">GMV/hr (Normal)</th>
                                  <th className="text-right">KPI Tier</th>
                                  <th className="text-right">Commission</th>
                                </tr>
                              </thead>
                              <tbody>
                                {s.byBrand.map((b) => (
                                  <tr key={b.brandId}>
                                    <td className="font-medium">{b.brandName}</td>
                                    <td className="text-right">{b.completedSessions}</td>
                                    <td className="text-right">{b.totalHours.toFixed(1)}h</td>
                                    <td className="text-right">{formatCurrency(b.totalGMV)}</td>
                                    <td className="text-right">
                                      <span style={{ color: b.kpiAchievedTier === 2 ? "var(--success)" : b.kpiAchievedTier === 1 ? "var(--warning)" : "var(--text-secondary)", fontWeight: 600 }}>
                                        {formatCurrency(b.normalDayGMVPerHour)}
                                      </span>
                                    </td>
                                    <td className="text-right">
                                      <TierBadge tier={b.kpiAchievedTier} />
                                    </td>
                                    <td className="text-right font-semibold" style={{ color: "var(--success)" }}>
                                      {formatCurrency(b.estimatedCommission)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr style={{ borderTop: "2px solid var(--border)" }}>
                                  <td colSpan={5} className="font-semibold" style={{ color: "var(--text-primary)" }}>Net Commission (after deductions)</td>
                                  <td />
                                  <td className="text-right font-bold text-base" style={{ color: "var(--success)" }}>{formatCurrency(s.netCommission)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────────────────────

type PayrollTab = "parttime" | "fulltime";

export default function PayrollPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [activeTab, setActiveTab] = useState<PayrollTab>("parttime");

  return (
    <div className="space-y-5 animate-in">
      {/* Header */}
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

      {/* Tabs */}
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
