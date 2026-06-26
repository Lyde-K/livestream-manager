"use client";
import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck, AlertTriangle, XCircle, RefreshCw,
  Trash2, CheckCircle2, ClipboardList, Calendar,
} from "lucide-react";

interface ScheduleCheck {
  count: number;
  ok: boolean;
  label: string;
  sample?: { id: string; host: string; brand: string; startMYT: string }[];
}

interface TaskSample {
  id: string;
  title: string;
  status?: string;
  createdBy?: string;
  team?: string | null;
  createdAt?: string;
}

interface TaskCheck {
  count: number;
  ok: boolean;
  label: string;
  sample?: TaskSample[];
}

interface HealthReport {
  status: "healthy" | "warning" | "critical";
  schedule: {
    ghostSessions: ScheduleCheck;
    suspiciousMYT: ScheduleCheck;
    duplicateSessions: ScheduleCheck;
  };
  tasks: {
    invisibleTasks: TaskCheck;
    teamMismatch: TaskCheck;
  };
  checkedAt: string;
}

const STATUS_META = {
  healthy:  { icon: ShieldCheck,   color: "#22c55e", bg: "rgba(34,197,94,0.10)",  label: "All systems healthy" },
  warning:  { icon: AlertTriangle, color: "#f59e0b", bg: "rgba(245,158,11,0.10)", label: "Issues detected" },
  critical: { icon: XCircle,       color: "#ef4444", bg: "rgba(239,68,68,0.10)",  label: "Critical issues detected" },
};

export default function AdminHealthPage() {
  const [report, setReport]   = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing]   = useState(false);
  const [fixMsg, setFixMsg]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFixMsg(null);
    const res = await fetch("/api/admin/health");
    setReport(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function deleteGhosts() {
    if (!confirm("Permanently delete all ghost sessions (no host + no room)?")) return;
    setFixing(true);
    const res = await fetch("/api/admin/sessions/orphaned", {
      method: "DELETE",
      headers: { "x-confirm-delete-orphaned": "yes-delete-all-orphaned" },
    });
    const data = await res.json();
    setFixing(false);
    if (data.ok) {
      setFixMsg(`Deleted ${data.deleted} ghost session${data.deleted !== 1 ? "s" : ""}.`);
      load();
    } else {
      setFixMsg(`Error: ${data.error ?? "Unknown"}`);
    }
  }

  const meta = report ? STATUS_META[report.status] : null;
  const StatusIcon = meta?.icon ?? ShieldCheck;

  return (
    <div className="space-y-5 animate-in max-w-3xl">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(99,102,241,0.12)" }}>
            <ShieldCheck size={16} style={{ color: "#6366f1" }} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Data Health Monitor</h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Prevention · Detection · Recovery — schedule &amp; task management
            </p>
          </div>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ color: "var(--text-secondary)", background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Level 1 — Prevention summary */}
      <div className="section-card px-4 py-3 flex gap-3 items-start">
        <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" style={{ color: "#22c55e" }} />
        <div>
          <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Level 1 · Prevention — Active</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            <strong>Schedule:</strong> API rejects sessions with no brand, or with neither a host nor a room.<br />
            <strong>Tasks:</strong> The "My Tasks" filter covers creator, direct assignee, and team membership — tasks you create always appear in your view.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="section-card p-12 text-center" style={{ color: "var(--text-muted)" }}>
          <RefreshCw size={18} className="mx-auto mb-2 animate-spin" />
          Running health checks…
        </div>
      ) : report ? (
        <>
          {/* Status banner */}
          <div className="section-card px-4 py-3 flex items-center gap-3"
            style={{ background: meta!.bg, borderColor: `${meta!.color}30` }}>
            <StatusIcon size={18} style={{ color: meta!.color }} />
            <div className="flex-1">
              <p className="font-bold text-sm" style={{ color: meta!.color }}>{meta!.label}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                Checked: {new Date(report.checkedAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })} MYT
              </p>
            </div>
          </div>

          {/* ── Schedule checks ── */}
          <div className="section-card divide-y" style={{ borderColor: "var(--border)" }}>
            <div className="px-4 py-3 flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
              <Calendar size={13} style={{ color: "#f97316" }} />
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Schedule · Level 2 Detection
              </p>
            </div>

            <CheckRow
              check={report.schedule.ghostSessions}
              action={
                !report.schedule.ghostSessions.ok ? (
                  <button onClick={deleteGhosts} disabled={fixing}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
                    style={{ color: "#ef4444", background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)" }}>
                    <Trash2 size={11} />
                    {fixing ? "Deleting…" : "Delete All Ghosts"}
                  </button>
                ) : null
              }
            />

            <CheckRow
              check={report.schedule.suspiciousMYT}
              detail={
                report.schedule.suspiciousMYT.sample?.length ? (
                  <div className="mt-2 space-y-1 pl-0">
                    {report.schedule.suspiciousMYT.sample.map(s => (
                      <div key={s.id} className="text-[11px] flex gap-2" style={{ color: "var(--text-muted)" }}>
                        <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>{s.host}</span>
                        <span>·</span><span>{s.brand}</span>
                        <span>·</span><span className="font-mono">{s.startMYT}</span>
                      </div>
                    ))}
                    {report.schedule.suspiciousMYT.count > 5 && (
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        …and {report.schedule.suspiciousMYT.count - 5} more. Review in admin schedule grid.
                      </p>
                    )}
                  </div>
                ) : null
              }
            />

            <CheckRow check={report.schedule.duplicateSessions} />
          </div>

          {/* ── Task checks ── */}
          <div className="section-card divide-y" style={{ borderColor: "var(--border)" }}>
            <div className="px-4 py-3 flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
              <ClipboardList size={13} style={{ color: "#6366f1" }} />
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Task Management · Level 2 Detection
              </p>
            </div>

            <CheckRow
              check={report.tasks.invisibleTasks}
              detail={
                report.tasks.invisibleTasks.sample?.length ? (
                  <div className="mt-2 space-y-1">
                    {report.tasks.invisibleTasks.sample.map(t => (
                      <div key={t.id} className="text-[11px] flex gap-2 flex-wrap" style={{ color: "var(--text-muted)" }}>
                        <span className="font-semibold truncate max-w-[200px]" style={{ color: "var(--text-secondary)" }}>{t.title}</span>
                        <span>·</span><span>by {t.createdBy}</span>
                        {t.team && <><span>·</span><span>{t.team}</span></>}
                        <span className="px-1 rounded text-[10px] font-bold uppercase"
                          style={{ background: "rgba(148,163,184,0.12)", color: "#94a3b8" }}>{t.status}</span>
                      </div>
                    ))}
                    {report.tasks.invisibleTasks.count > 20 && (
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        …and {report.tasks.invisibleTasks.count - 20} more. Open Task Management → All Tasks to find unassigned tasks.
                      </p>
                    )}
                  </div>
                ) : null
              }
              hint="Open All Tasks and filter by team to find and assign these."
            />

            <CheckRow
              check={report.tasks.teamMismatch}
              detail={
                report.tasks.teamMismatch.sample?.length ? (
                  <div className="mt-2 space-y-1">
                    {report.tasks.teamMismatch.sample.map(t => (
                      <div key={t.id} className="text-[11px] flex gap-2" style={{ color: "var(--text-muted)" }}>
                        <span className="font-semibold truncate max-w-[200px]" style={{ color: "var(--text-secondary)" }}>{t.title}</span>
                        <span>·</span><span>team: {t.team}</span>
                        <span>·</span><span>by {t.createdBy}</span>
                      </div>
                    ))}
                  </div>
                ) : null
              }
              hint="Re-assign or move each task to a team the assignee belongs to."
            />
          </div>

          {/* Fix message */}
          {fixMsg && (
            <div className="section-card px-4 py-3 text-xs font-semibold"
              style={{ color: fixMsg.startsWith("Error") ? "#ef4444" : "#22c55e" }}>
              {fixMsg}
            </div>
          )}

          {/* Level 3 note */}
          <div className="section-card px-4 py-3 flex gap-3 items-start">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" style={{ color: "#f59e0b" }} />
            <div>
              <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Level 3 · Recovery</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                <strong>Schedule:</strong> Ghost sessions → one-click delete above. Suspicious MYT times → review manually in schedule grid.<br />
                <strong>Tasks:</strong> Invisible tasks (no assignee) → open All Tasks and assign. Team-mismatch tasks → reassign or move to correct team. All fixes reflect immediately.
              </p>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function CheckRow({
  check,
  action,
  detail,
  hint,
}: {
  check: { count: number; ok: boolean; label: string };
  action?: React.ReactNode;
  detail?: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        {check.ok
          ? <CheckCircle2 size={15} className="flex-shrink-0 mt-0.5" style={{ color: "#22c55e" }} />
          : <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" style={{ color: "#f59e0b" }} />}
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{check.label}</p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: check.ok ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)",
                  color: check.ok ? "#22c55e" : "#ef4444",
                }}>
                {check.count}
              </span>
              {action}
            </div>
          </div>
          {detail}
          {hint && !check.ok && (
            <p className="text-[11px] mt-1.5 italic" style={{ color: "var(--text-muted)" }}>{hint}</p>
          )}
        </div>
      </div>
    </div>
  );
}
