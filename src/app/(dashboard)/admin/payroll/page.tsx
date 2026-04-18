"use client";
import { useState, useEffect } from "react";
import { Select } from "@/components/ui/select";
import { format } from "date-fns";
import {
  Clock, DollarSign, User, ChevronDown, ChevronRight,
  Banknote, Phone, CreditCard,
} from "lucide-react";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

interface PayrollSession {
  id: string;
  brandName: string;
  platform: string;
  scheduledStart: string;
  actualDurationMinutes: number | null;
  isCampaignDay: boolean;
  gmv: number | null;
}

interface HostPayroll {
  hostId: string;
  displayName: string;
  hourlyRate: number;
  contactNo: string | null;
  icNo: string | null;
  bankName: string | null;
  bankAccount: string | null;
  totalSessions: number;
  totalMinutes: number;
  totalHours: number;
  totalPay: number;
  sessions: PayrollSession[];
}

function fmtMin(min: number | null) {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtMYR(val: number) {
  return `RM ${val.toFixed(2)}`;
}

export default function PayrollPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<HostPayroll[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/payroll?month=${month}&year=${year}`);
    const json = await res.json();
    setData(Array.isArray(json) ? json : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [month, year]);

  const grandTotal = data.reduce((sum, h) => sum + h.totalPay, 0);
  const totalHours = data.reduce((sum, h) => sum + h.totalHours, 0);
  const totalSessions = data.reduce((sum, h) => sum + h.totalSessions, 0);

  return (
    <div className="space-y-5 animate-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            Part-Time Payroll
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Freelance / part-time host hours &amp; payment at RM40/hour
          </p>
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

      {/* Summary strip */}
      {!loading && data.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <SummaryCard label="Total Sessions" value={String(totalSessions)} icon={Clock} />
          <SummaryCard label="Total Hours" value={`${totalHours.toFixed(1)}h`} icon={Clock} />
          <SummaryCard label="Total Payroll" value={fmtMYR(grandTotal)} icon={DollarSign} accent />
        </div>
      )}

      {loading ? (
        <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
          <div className="inline-block w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin mb-2" />
          <div>Loading…</div>
        </div>
      ) : data.length === 0 ? (
        <div className="section-card empty-state">No part-time sessions recorded for this period.</div>
      ) : (
        <div className="space-y-3">
          {data.map((host) => (
            <div key={host.hostId} className="section-card overflow-hidden">
              {/* Host header */}
              <div
                className="px-5 py-4 flex items-center gap-4 cursor-pointer transition-colors"
                onClick={() => setExpanded(expanded === host.hostId ? null : host.hostId)}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                  style={{ background: "var(--accent-light)", color: "var(--accent-text)" }}
                >
                  {host.displayName.charAt(0)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-semibold" style={{ color: "var(--text-primary)" }}>
                    {host.displayName}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Part-time · RM{host.hourlyRate}/hr
                  </div>
                </div>

                {/* Chips */}
                <div className="hidden sm:flex items-center gap-4 text-xs">
                  <Chip label="Sessions" value={String(host.totalSessions)} />
                  <Chip label="Hours" value={`${host.totalHours.toFixed(2)}h`} />
                  <Chip label="Amount Due" value={fmtMYR(host.totalPay)} accent={host.totalPay > 0} />
                </div>

                {expanded === host.hostId
                  ? <ChevronDown size={16} style={{ color: "var(--text-muted)" }} className="flex-shrink-0" />
                  : <ChevronRight size={16} style={{ color: "var(--text-muted)" }} className="flex-shrink-0" />}
              </div>

              {/* Expanded detail */}
              {expanded === host.hostId && (
                <div style={{ borderTop: "1px solid var(--border)" }}>
                  {/* Banking details */}
                  <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-3"
                    style={{ background: "var(--bg-subtle)" }}>
                    <BankDetail icon={Phone} label="Contact" value={host.contactNo} />
                    <BankDetail icon={CreditCard} label="IC No" value={host.icNo} />
                    <BankDetail icon={Banknote} label="Bank" value={
                      host.bankName && host.bankAccount
                        ? `${host.bankName} · ${host.bankAccount}`
                        : host.bankName || "—"
                    } />
                  </div>

                  {/* Sessions table */}
                  {host.sessions.length === 0 ? (
                    <div className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                      No completed sessions this period.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Brand</th>
                            <th>Platform</th>
                            <th>Type</th>
                            <th className="text-right">Duration</th>
                            <th className="text-right">GMV</th>
                            <th className="text-right">Pay</th>
                          </tr>
                        </thead>
                        <tbody>
                          {host.sessions.map((s) => {
                            const hrs = (s.actualDurationMinutes || 0) / 60;
                            const pay = hrs * host.hourlyRate;
                            return (
                              <tr key={s.id}>
                                <td className="whitespace-nowrap">
                                  {format(new Date(s.scheduledStart), "dd MMM yyyy")}
                                </td>
                                <td className="font-medium">{s.brandName}</td>
                                <td>
                                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                    style={{
                                      background: s.platform === "TIKTOK" ? "rgba(0,0,0,0.08)" : "rgba(238,77,45,0.12)",
                                      color: s.platform === "TIKTOK" ? "var(--text-primary)" : "#ee4d2d",
                                    }}>
                                    {s.platform}
                                  </span>
                                </td>
                                <td>
                                  <span className="text-xs" style={{ color: s.isCampaignDay ? "var(--warning)" : "var(--text-muted)" }}>
                                    {s.isCampaignDay ? "Campaign" : "BAU"}
                                  </span>
                                </td>
                                <td className="text-right tabular-nums">
                                  {fmtMin(s.actualDurationMinutes)}
                                </td>
                                <td className="text-right tabular-nums">
                                  {s.gmv != null ? `RM ${s.gmv.toFixed(0)}` : "—"}
                                </td>
                                <td className="text-right tabular-nums font-semibold"
                                  style={{ color: "var(--success)" }}>
                                  {fmtMYR(pay)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ borderTop: "2px solid var(--border)" }}>
                            <td colSpan={4} className="font-semibold" style={{ color: "var(--text-primary)" }}>
                              Total
                            </td>
                            <td className="text-right font-semibold tabular-nums">
                              {fmtMin(host.totalMinutes)}
                            </td>
                            <td />
                            <td className="text-right font-bold tabular-nums text-base"
                              style={{ color: "var(--success)" }}>
                              {fmtMYR(host.totalPay)}
                            </td>
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
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

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
        <div className="text-lg font-bold" style={{ color: accent ? "var(--accent)" : "var(--text-primary)" }}>
          {value}
        </div>
      </div>
    </div>
  );
}

function Chip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-end">
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="font-semibold text-sm" style={{ color: accent ? "var(--success)" : "var(--text-primary)" }}>
        {value}
      </div>
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
