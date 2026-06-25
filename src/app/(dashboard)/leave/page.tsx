"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { format, parseISO, addDays } from "date-fns";
import {
  CalendarOff, CheckCircle2, XCircle, Clock, Plus, ChevronDown, ChevronUp,
  Info, TrendingUp, Hourglass, CircleCheck, Sparkles, Users, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import type { RLContribution, RLUnit, RLSummary } from "@/app/api/replacement-leave/route";

// ── Shared helpers ────────────────────────────────────────────────────────────

function mytToday(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

function fmtDate(d: string) {
  return format(parseISO(d), "d MMM yyyy");
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    PENDING:  { label: "Pending",  bg: "#f59e0b20", color: "#f59e0b" },
    APPROVED: { label: "Approved", bg: "#22c55e20", color: "#22c55e" },
    REJECTED: { label: "Rejected", bg: "#ef444420", color: "#ef4444" },
  };
  const s = map[status] ?? { label: status, bg: "var(--bg-subtle)", color: "var(--text-muted)" };
  return (
    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function ReasonPill({ reason }: { reason: string }) {
  if (reason === "OFF_DAY") return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "#6366f120", color: "#6366f1" }}>Off-Day</span>
  );
  if (reason === "EXTRA_HOURS") return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "#f9731620", color: "#f97316" }}>Extra Hours</span>
  );
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "var(--bg-subtle)", color: "var(--text-muted)" }}>Manual</span>
  );
}

// ── Apply Leave Modal ─────────────────────────────────────────────────────────

function ApplyLeaveModal({ summary, onClose, onSubmitted }: {
  summary: RLSummary;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const today = mytToday();
  const [selectedDate, setSelectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const nextUnlock = summary.units.find(u => !u.isUnlocked);

  async function submit() {
    if (!selectedDate) { setError("Please select a date."); return; }
    setSaving(true);
    setError("");
    const res = await fetch("/api/replacement-leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leaveDate: selectedDate, notes }),
    });
    setSaving(false);
    if (res.ok) { onSubmitted(); }
    else { const d = await res.json(); setError(d.error ?? "Failed to submit"); }
  }

  return (
    <Modal open onClose={onClose} title="Apply for Replacement Leave" size="lg">
      <div className="space-y-5">
        {/* Balance snapshot */}
        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
          <div className="text-center flex-1">
            <div className="text-2xl font-bold" style={{ color: "var(--accent)" }}>{summary.unitsAvailable}</div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>Available</div>
          </div>
          <div className="w-px h-8 self-center" style={{ background: "var(--border)" }} />
          <div className="text-center flex-1">
            <div className="text-2xl font-bold" style={{ color: "var(--text-secondary)" }}>{summary.unitsPendingUnlock}</div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>Pending Unlock</div>
          </div>
          {nextUnlock && (
            <>
              <div className="w-px h-8 self-center" style={{ background: "var(--border)" }} />
              <div className="text-center flex-1">
                <div className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Next unlock</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{fmtDate(nextUnlock.unlockDate)}</div>
              </div>
            </>
          )}
        </div>

        {summary.unitsAvailable < 1 ? (
          <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: "#ef444410", border: "1px solid #ef444430", color: "#ef4444" }}>
            <AlertCircle size={15} />
            <span className="text-sm">You have no available Replacement Leave units to use.</span>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                Select Leave Date *
              </label>
              <input
                type="date"
                value={selectedDate}
                min={today}
                onChange={e => { setSelectedDate(e.target.value); setError(""); }}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{
                  background: "var(--bg-subtle)", border: "1px solid var(--border)",
                  color: "var(--text-primary)", colorScheme: "dark",
                }}
              />
              <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
                Your scheduled sessions on this day will be removed upon admin approval.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Any additional context for the admin…"
                className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
            </div>

            {error && (
              <div className="text-sm p-2.5 rounded-lg" style={{ background: "#ef444410", color: "#ef4444" }}>{error}</div>
            )}
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {summary.unitsAvailable > 0 && (
            <Button onClick={submit} loading={saving} disabled={!selectedDate}>
              <CheckCircle2 size={14} /> Submit Application
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Host View ─────────────────────────────────────────────────────────────────

interface HostApplication {
  id: string; leaveDate: string; status: string; notes?: string | null;
  adminNote?: string | null; createdAt: string;
}

function HostView() {
  const [data, setData] = useState<{ summary: RLSummary; applications: HostApplication[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [applyOpen, setApplyOpen] = useState(false);
  const [showContribs, setShowContribs] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/replacement-leave");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function cancelApplication(id: string) {
    await fetch(`/api/replacement-leave/${id}`, { method: "DELETE" });
    setCancelId(null);
    load();
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>
    </div>
  );

  const { summary, applications } = data!;
  const today = mytToday();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Replacement Leave</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Track and apply for your replacement leave entitlements
          </p>
        </div>
        <Button onClick={() => setApplyOpen(true)} disabled={summary.unitsAvailable < 1}>
          <Plus size={14} /> Apply for Leave
        </Button>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: CircleCheck,  label: "Available",       value: summary.unitsAvailable,      color: "#22c55e", hint: "Ready to use now" },
          { icon: Hourglass,    label: "Pending Unlock",  value: summary.unitsPendingUnlock,  color: "#f59e0b", hint: "Within 15-day wait" },
          { icon: Clock,        label: "Awaiting Approval",value: summary.unitsPendingApproval,color: "#6366f1", hint: "Applications pending" },
          { icon: TrendingUp,   label: "Used This Year",  value: summary.unitsUsed,           color: "var(--text-muted)", hint: "Approved leaves taken" },
        ].map(({ icon: Icon, label, value, color, hint }) => (
          <div key={label} className="section-card p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 mb-1">
              <Icon size={14} style={{ color }} />
              <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
            </div>
            <div className="text-3xl font-bold" style={{ color }}>{value}</div>
            <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="section-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Info size={14} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>How Replacement Leave Works</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
          <div className="flex flex-col gap-1 p-3 rounded-lg" style={{ background: "var(--bg-subtle)" }}>
            <span className="font-semibold mb-0.5" style={{ color: "var(--text-primary)" }}>How you earn RL</span>
            <span>Working on your scheduled <strong>off-days</strong> during campaigns, or working <strong>extra hours</strong> beyond 6h standard.</span>
          </div>
          <div className="flex flex-col gap-1 p-3 rounded-lg" style={{ background: "var(--bg-subtle)" }}>
            <span className="font-semibold mb-0.5" style={{ color: "var(--text-primary)" }}>Accumulation</span>
            <span>Every <strong>6 excess hours</strong> earned = 1 Replacement Leave day. Hours stack across multiple sessions.</span>
          </div>
          <div className="flex flex-col gap-1 p-3 rounded-lg" style={{ background: "var(--bg-subtle)" }}>
            <span className="font-semibold mb-0.5" style={{ color: "var(--text-primary)" }}>15-Day Rule</span>
            <span>Each RL unit is locked for <strong>15 days</strong> from the day it was earned before you can use it.</span>
          </div>
        </div>
      </div>

      {/* RL Units Timeline */}
      {summary.units.length > 0 && (
        <div className="section-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles size={14} style={{ color: "var(--accent)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Earned RL Units</span>
            <span className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>{summary.unitsEarned} total</span>
          </div>
          <div className="space-y-2">
            {summary.units.map((u, i) => {
              const usedUnit = i < summary.unitsUsed;
              const pendingUnit = !usedUnit && i >= summary.unitsUsed && i < summary.unitsUsed + summary.unitsPendingApproval;
              const available = !usedUnit && !pendingUnit && u.isUnlocked;
              const locked = !usedUnit && !pendingUnit && !u.isUnlocked;
              return (
                <div key={u.unitNumber} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                  style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", opacity: usedUnit ? 0.55 : 1 }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{
                      background: usedUnit ? "var(--bg-card)" : available ? "#22c55e20" : locked ? "#f59e0b20" : "#6366f120",
                      color: usedUnit ? "var(--text-muted)" : available ? "#22c55e" : locked ? "#f59e0b" : "#6366f1",
                    }}>
                    {u.unitNumber}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                      Earned {fmtDate(u.triggeredDate)}
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {locked ? `Unlocks ${fmtDate(u.unlockDate)}` : `Unlocked ${fmtDate(u.unlockDate)}`}
                    </div>
                  </div>
                  <div>
                    {usedUnit && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#94a3b815", color: "#94a3b8" }}>Used</span>}
                    {pendingUnit && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#6366f120", color: "#6366f1" }}>Pending Approval</span>}
                    {available && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#22c55e20", color: "#22c55e" }}>Available</span>}
                    {locked && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#f59e0b20", color: "#f59e0b" }}>Locked</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hour Contributions (expandable) */}
      {summary.contributions.length > 0 && (
        <div className="section-card overflow-hidden">
          <button
            onClick={() => setShowContribs(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
            style={{ borderBottom: showContribs ? "1px solid var(--border)" : "none" }}>
            <div className="flex items-center gap-2">
              <TrendingUp size={14} style={{ color: "var(--accent)" }} />
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Hours Contribution History
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {summary.totalHours.toFixed(1)}h total · {summary.contributions.length} entry(s)
              </span>
            </div>
            {showContribs ? <ChevronUp size={15} style={{ color: "var(--text-muted)" }} /> : <ChevronDown size={15} style={{ color: "var(--text-muted)" }} />}
          </button>
          {showContribs && (
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {summary.contributions.map((c, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-20 flex-shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>{fmtDate(c.date)}</div>
                  <ReasonPill reason={c.reason} />
                  <div className="flex-1 text-xs truncate" style={{ color: "var(--text-secondary)" }}>{c.description}</div>
                  <div className="text-xs font-medium tabular-nums flex-shrink-0" style={{ color: c.hours >= 0 ? "#22c55e" : "#ef4444" }}>
                    {c.hours >= 0 ? "+" : ""}{c.hours.toFixed(1)}h
                  </div>
                  <div className="w-16 text-right text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    ∑ {c.runningTotal.toFixed(1)}h
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {summary.contributions.length === 0 && (
        <div className="section-card p-8 text-center" style={{ color: "var(--text-muted)" }}>
          <CalendarOff size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No replacement leave earned yet.</p>
          <p className="text-xs mt-1">Work on off-days during campaigns or extra hours beyond 6h to earn RL.</p>
        </div>
      )}

      {/* My Applications */}
      <div className="section-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarOff size={14} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>My Applications</span>
        </div>
        {applications.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: "var(--text-muted)" }}>No applications yet.</p>
        ) : (
          <div className="space-y-2">
            {applications.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {fmtDate(a.leaveDate)}
                    </span>
                    <StatusPill status={a.status} />
                    {a.leaveDate < today && a.status === "PENDING" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#f59e0b15", color: "#f59e0b" }}>Past date</span>
                    )}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    Applied {format(new Date(a.createdAt), "d MMM yyyy")}
                    {a.notes && <> · "{a.notes}"</>}
                  </div>
                  {a.adminNote && (
                    <div className="text-xs mt-0.5 italic" style={{ color: "var(--text-secondary)" }}>
                      Admin: {a.adminNote}
                    </div>
                  )}
                </div>
                {a.status === "PENDING" && (
                  <button
                    onClick={() => setCancelId(a.id)}
                    className="text-xs px-2 py-1 rounded cursor-pointer flex-shrink-0"
                    style={{ color: "#ef4444", background: "#ef444415" }}>
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {applyOpen && (
        <ApplyLeaveModal
          summary={summary}
          onClose={() => setApplyOpen(false)}
          onSubmitted={() => { setApplyOpen(false); load(); }}
        />
      )}
      {cancelId && (
        <Modal open onClose={() => setCancelId(null)} title="Cancel Application">
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Are you sure you want to cancel this leave application? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCancelId(null)}>Keep It</Button>
              <Button variant="destructive" onClick={() => cancelApplication(cancelId)}>Yes, Cancel</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Admin View ────────────────────────────────────────────────────────────────

interface AdminHostSummary {
  host: { id: string; displayName: string; user: { name: string } };
  summary: RLSummary;
}

interface PendingApp {
  id: string; leaveDate: string; status: string; notes?: string | null; createdAt: string;
  liveHost: { id: string; displayName: string; user: { name: string } };
}

function ApproveModal({ app, onClose, onDone }: {
  app: PendingApp;
  onClose: () => void;
  onDone: () => void;
}) {
  const [adminNote, setAdminNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ removedSessions?: { id: string; brand: { name: string }; scheduledStart: string }[] } | null>(null);

  async function act(action: "APPROVE" | "REJECT") {
    setSaving(true);
    const res = await fetch(`/api/replacement-leave/${app.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, adminNote }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      if (action === "APPROVE") { setResult(data); }
      else { onDone(); }
    }
  }

  if (result) {
    return (
      <Modal open onClose={() => { onClose(); onDone(); }} title="Application Approved">
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: "#22c55e10", border: "1px solid #22c55e30" }}>
            <CheckCircle2 size={16} color="#22c55e" />
            <span className="text-sm font-medium" style={{ color: "#22c55e" }}>Leave approved for {app.liveHost.displayName}</span>
          </div>
          {result.removedSessions && result.removedSessions.length > 0 ? (
            <div>
              <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>
                {result.removedSessions.length} session(s) removed from {fmtDate(app.leaveDate)}:
              </p>
              <div className="space-y-1">
                {result.removedSessions.map(s => (
                  <div key={s.id} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>
                    {s.brand.name} · {format(new Date(s.scheduledStart), "HH:mm")}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No pending sessions were found on {fmtDate(app.leaveDate)}.</p>
          )}
          <div className="flex justify-end">
            <Button onClick={() => { onClose(); onDone(); }}>Done</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Review Leave Application" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="p-3 rounded-lg" style={{ background: "var(--bg-subtle)" }}>
            <div className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Host</div>
            <div className="font-medium" style={{ color: "var(--text-primary)" }}>{app.liveHost.displayName}</div>
          </div>
          <div className="p-3 rounded-lg" style={{ background: "var(--bg-subtle)" }}>
            <div className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Leave Date</div>
            <div className="font-medium" style={{ color: "var(--text-primary)" }}>{fmtDate(app.leaveDate)}</div>
          </div>
          <div className="p-3 rounded-lg" style={{ background: "var(--bg-subtle)" }}>
            <div className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Applied On</div>
            <div className="font-medium" style={{ color: "var(--text-primary)" }}>{format(new Date(app.createdAt), "d MMM yyyy")}</div>
          </div>
          {app.notes && (
            <div className="p-3 rounded-lg" style={{ background: "var(--bg-subtle)" }}>
              <div className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Host Notes</div>
              <div className="font-medium italic" style={{ color: "var(--text-secondary)" }}>{app.notes}</div>
            </div>
          )}
        </div>
        <div className="p-3 rounded-lg text-xs" style={{ background: "#f59e0b10", border: "1px solid #f59e0b30", color: "#f59e0b" }}>
          <strong>On Approve:</strong> All pending sessions for {app.liveHost.displayName} on {fmtDate(app.leaveDate)} will be automatically removed from the schedule.
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Admin Note (optional)</label>
          <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={2}
            placeholder="Add a note for the host…"
            className="w-full px-3 py-2 rounded-lg text-sm resize-none"
            style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => act("REJECT")} loading={saving}>
            <XCircle size={14} /> Reject
          </Button>
          <Button onClick={() => act("APPROVE")} loading={saving}>
            <CheckCircle2 size={14} /> Approve
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AddCreditModal({ hosts, onClose, onDone }: {
  hosts: { id: string; displayName: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [liveHostId, setLiveHostId] = useState("");
  const [date, setDate] = useState(mytToday());
  const [hours, setHours] = useState("6");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!liveHostId || !date || !reason) return;
    setSaving(true);
    await fetch("/api/replacement-leave/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ liveHostId, date, hours: parseFloat(hours), reason }),
    });
    setSaving(false);
    onDone();
  }

  return (
    <Modal open onClose={onClose} title="Add Manual RL Credit" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Host *</label>
            <select value={liveHostId} onChange={e => setLiveHostId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
              <option value="">Select host…</option>
              {hosts.map(h => <option key={h.id} value={h.id}>{h.displayName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Date *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)", colorScheme: "dark" }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Hours (positive = add, negative = deduct)</label>
            <input type="number" value={hours} onChange={e => setHours(e.target.value)} step="0.5"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Reason *</label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Campaign bonus, manual correction…"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} disabled={!liveHostId || !reason}>Save Adjustment</Button>
        </div>
      </div>
    </Modal>
  );
}

function AdminView() {
  const [data, setData] = useState<{ summaries: AdminHostSummary[]; pendingApps: PendingApp[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewApp, setReviewApp] = useState<PendingApp | null>(null);
  const [expandedHost, setExpandedHost] = useState<string | null>(null);
  const [addCreditOpen, setAddCreditOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/replacement-leave/admin");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>
    </div>
  );

  const { summaries, pendingApps } = data!;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Replacement Leave</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Manage host replacement leave balances and applications
          </p>
        </div>
        <Button variant="outline" onClick={() => setAddCreditOpen(true)}>
          <Plus size={14} /> Manual Credit
        </Button>
      </div>

      {/* Pending Approvals */}
      <div className="section-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertCircle size={14} style={{ color: pendingApps.length > 0 ? "#f59e0b" : "var(--text-muted)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Pending Approvals</span>
          {pendingApps.length > 0 && (
            <span className="ml-1 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold"
              style={{ background: "#f59e0b", color: "#000" }}>{pendingApps.length}</span>
          )}
        </div>
        {pendingApps.length === 0 ? (
          <div className="flex items-center gap-2 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
            <CheckCircle2 size={16} />
            <span>No pending applications — all clear!</span>
          </div>
        ) : (
          <div className="space-y-2">
            {pendingApps.map(app => (
              <div key={app.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: "var(--accent)20", color: "var(--accent)" }}>
                  {app.liveHost.displayName.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{app.liveHost.displayName}</span>
                    <span className="text-sm" style={{ color: "var(--text-secondary)" }}>→ {fmtDate(app.leaveDate)}</span>
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Applied {format(new Date(app.createdAt), "d MMM yyyy")}
                    {app.notes && <> · "{app.notes}"</>}
                  </div>
                </div>
                <button
                  onClick={() => setReviewApp(app)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all"
                  style={{ background: "var(--accent)", color: "#fff" }}>
                  Review
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* All Hosts RL Balance */}
      <div className="section-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <Users size={14} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>All Hosts — RL Balance</span>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {summaries.map(({ host, summary: s }) => (
            <div key={host.id}>
              <button
                onClick={() => setExpandedHost(expandedHost === host.id ? null : host.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer transition-colors"
                style={{ background: expandedHost === host.id ? "var(--bg-subtle)" : "transparent" }}>
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: "var(--accent)20", color: "var(--accent)" }}>
                  {host.displayName.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{host.displayName}</span>
                </div>
                {/* Balance chips */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {s.unitsAvailable > 0 && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                      style={{ background: "#22c55e20", color: "#22c55e" }}>
                      <CircleCheck size={10} /> {s.unitsAvailable} available
                    </div>
                  )}
                  {s.unitsPendingUnlock > 0 && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                      style={{ background: "#f59e0b20", color: "#f59e0b" }}>
                      <Hourglass size={10} /> {s.unitsPendingUnlock} locked
                    </div>
                  )}
                  {s.unitsPendingApproval > 0 && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                      style={{ background: "#6366f120", color: "#6366f1" }}>
                      <Clock size={10} /> {s.unitsPendingApproval} pending
                    </div>
                  )}
                  {s.unitsEarned === 0 && (
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>No RL earned</span>
                  )}
                </div>
                {expandedHost === host.id
                  ? <ChevronUp size={14} style={{ color: "var(--text-muted)" }} />
                  : <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />}
              </button>

              {expandedHost === host.id && (
                <div className="px-4 pb-4 space-y-3" style={{ background: "var(--bg-subtle)" }}>
                  {/* Stats row */}
                  <div className="grid grid-cols-4 gap-2 pt-2">
                    {[
                      { label: "Available", value: s.unitsAvailable, color: "#22c55e" },
                      { label: "Locked", value: s.unitsPendingUnlock, color: "#f59e0b" },
                      { label: "Pending", value: s.unitsPendingApproval, color: "#6366f1" },
                      { label: "Used", value: s.unitsUsed, color: "var(--text-muted)" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="text-center p-2 rounded-lg" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                        <div className="text-lg font-bold" style={{ color }}>{value}</div>
                        <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Contributions list */}
                  {s.contributions.length > 0 ? (
                    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                      <div className="grid grid-cols-[80px_80px_1fr_50px_60px] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ background: "var(--panel-header-bg)", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
                        <div>Date</div><div>Type</div><div>Description</div><div className="text-right">Hours</div><div className="text-right">∑ Total</div>
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y" style={{ borderColor: "var(--border)" }}>
                        {s.contributions.map((c, i) => (
                          <div key={i} className="grid grid-cols-[80px_80px_1fr_50px_60px] px-3 py-1.5 items-center">
                            <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{c.date.slice(5)}</div>
                            <ReasonPill reason={c.reason} />
                            <div className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>{c.description}</div>
                            <div className="text-[11px] text-right font-medium" style={{ color: c.hours >= 0 ? "#22c55e" : "#ef4444" }}>
                              {c.hours >= 0 ? "+" : ""}{c.hours.toFixed(1)}h
                            </div>
                            <div className="text-[11px] text-right" style={{ color: "var(--text-muted)" }}>
                              {c.runningTotal.toFixed(1)}h
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-center py-2" style={{ color: "var(--text-muted)" }}>No RL contributions yet.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      {reviewApp && (
        <ApproveModal
          app={reviewApp}
          onClose={() => setReviewApp(null)}
          onDone={() => { setReviewApp(null); load(); }}
        />
      )}
      {addCreditOpen && (
        <AddCreditModal
          hosts={summaries.map(s => ({ id: s.host.id, displayName: s.host.displayName }))}
          onClose={() => setAddCreditOpen(false)}
          onDone={() => { setAddCreditOpen(false); load(); }}
        />
      )}
    </div>
  );
}

// ── Page entry ────────────────────────────────────────────────────────────────

export default function LeavePage() {
  const { data: authSession } = useSession();
  const role = (authSession?.user as { role?: string })?.role;
  if (!role) return null;
  if (role === "ADMIN") return <AdminView />;
  if (role === "LIVE_HOST") return <HostView />;
  return <div className="p-8 text-center" style={{ color: "var(--text-muted)" }}>This page is not available for your role.</div>;
}
