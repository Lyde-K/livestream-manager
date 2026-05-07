"use client";
import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

interface SyncLogEntry {
  id: string;
  platform: string;
  rawHost: string;
  rawBrand: string;
  startTime: string;
  errorType: string;
  message: string;
  resolved: boolean;
  createdAt: string;
}

const ERROR_LABELS: Record<string, { label: string; color: string }> = {
  HOST_NOT_FOUND:  { label: "Host not found",       color: "var(--danger)" },
  BRAND_NOT_FOUND: { label: "Brand not found",      color: "var(--warning)" },
  BOTH_NOT_FOUND:  { label: "Host & Brand not found", color: "var(--danger)" },
  INVALID_DATE:    { label: "Invalid date",          color: "var(--text-muted)" },
};

export default function SyncLogPage() {
  const [logs, setLogs]             = useState<SyncLogEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [validHosts, setValidHosts]   = useState<string[]>([]);
  const [validBrands, setValidBrands] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [logsRes, hostsRes, brandsRes] = await Promise.all([
      fetch(`/api/sync/logs?resolved=${showResolved}`),
      fetch("/api/hosts"),
      fetch("/api/brands"),
    ]);
    const [logsData, hostsData, brandsData] = await Promise.all([
      logsRes.json(), hostsRes.json(), brandsRes.json(),
    ]);
    setLogs(logsData);
    setValidHosts((hostsData as any[]).map((h: any) => h.displayName));
    setValidBrands((brandsData as any[]).map((b: any) => b.name));
    setLoading(false);
  }, [showResolved]);

  useEffect(() => { load(); }, [load]);

  async function resolve(id: string) {
    await fetch("/api/sync/logs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setLogs(prev => prev.filter(l => l.id !== id));
  }

  async function resolveAll() {
    await fetch("/api/sync/logs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resolveAll: true }) });
    setLogs([]);
  }

  const unresolvedCount = logs.filter(l => !l.resolved).length;

  return (
    <div className="space-y-6 animate-in max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <AlertTriangle size={20} style={{ color: "var(--danger)" }} />
            Sync Errors
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Rows from Google Sheets that couldn&apos;t be matched to a host or brand.
            Fix the name in the sheet to match exactly, then re-sync.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button size="sm" variant="secondary" onClick={load}>
            <RefreshCw size={13} /> Refresh
          </Button>
          {unresolvedCount > 0 && (
            <Button size="sm" variant="secondary" onClick={resolveAll}>
              <CheckCircle2 size={13} /> Dismiss all
            </Button>
          )}
        </div>
      </div>

      {/* Valid keys reference */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="section-card p-4 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            ✅ Valid Host names (copy exactly)
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {validHosts.map(h => (
              <code key={h} className="px-2 py-0.5 rounded text-xs font-mono"
                style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                {h}
              </code>
            ))}
          </div>
        </div>
        <div className="section-card p-4 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            ✅ Valid Brand names (copy exactly)
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {validBrands.map(b => (
              <code key={b} className="px-2 py-0.5 rounded text-xs font-mono"
                style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                {b}
              </code>
            ))}
          </div>
        </div>
      </div>

      {/* Toggle resolved */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowResolved(v => !v)}
          className="text-xs font-medium px-3 py-1 rounded-full transition-colors"
          style={{
            background: showResolved ? "var(--accent)" : "var(--bg-subtle)",
            color: showResolved ? "#fff" : "var(--text-secondary)",
            border: "1px solid var(--border)",
          }}
        >
          {showResolved ? "Showing all (incl. resolved)" : "Showing unresolved only"}
        </button>
        {!loading && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {logs.length} {showResolved ? "total" : "unresolved"} error{logs.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Error table */}
      <div className="section-card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <CheckCircle2 size={32} className="mx-auto" style={{ color: "var(--success)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>No sync errors</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>All sheet rows matched successfully.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ background: "var(--bg-subtle)", borderBottom: "1px solid var(--border)" }}>
                  {["When", "Platform", "Error", "Raw Host (in sheet)", "Raw Brand (in sheet)", "Start Time", ""].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold"
                      style={{ color: "var(--text-secondary)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const err = ERROR_LABELS[log.errorType] ?? { label: log.errorType, color: "var(--text-muted)" };
                  const hostOk  = validHosts.some(h => h.toUpperCase() === log.rawHost.toUpperCase());
                  const brandOk = validBrands.some(b => b.toUpperCase() === log.rawBrand.toUpperCase());
                  return (
                    <tr key={log.id} style={{
                      borderBottom: "1px solid var(--border)",
                      opacity: log.resolved ? 0.45 : 1,
                      background: log.resolved ? "var(--bg-subtle)" : undefined,
                    }}>
                      <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                        {format(new Date(log.createdAt), "dd MMM HH:mm")}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
                          style={{
                            background: log.platform === "TIKTOK" ? "rgba(0,0,0,0.08)" : "rgba(238,77,45,0.1)",
                            color: log.platform === "TIKTOK" ? "var(--text-primary)" : "#ee4d2d",
                          }}>
                          {log.platform}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs font-medium" style={{ color: err.color }}>{err.label}</span>
                      </td>
                      <td className="px-3 py-2">
                        <code className="text-xs px-1.5 py-0.5 rounded font-mono"
                          style={{
                            background: hostOk ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                            color: hostOk ? "var(--success)" : "var(--danger)",
                            border: `1px solid ${hostOk ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                          }}>
                          {log.rawHost || "—"}
                        </code>
                      </td>
                      <td className="px-3 py-2">
                        <code className="text-xs px-1.5 py-0.5 rounded font-mono"
                          style={{
                            background: brandOk ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                            color: brandOk ? "var(--success)" : "var(--danger)",
                            border: `1px solid ${brandOk ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                          }}>
                          {log.rawBrand || "—"}
                        </code>
                      </td>
                      <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                        {log.startTime}
                      </td>
                      <td className="px-3 py-2">
                        {!log.resolved && (
                          <button onClick={() => resolve(log.id)}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors"
                            style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
                            title="Dismiss">
                            <Trash2 size={11} /> Dismiss
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Help */}
      <div className="section-card p-4 space-y-2 text-sm" style={{ color: "var(--text-secondary)" }}>
        <p className="font-semibold text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>How to fix</p>
        <ol className="list-decimal list-inside space-y-1 text-xs">
          <li>Look at the <strong>Raw Host</strong> or <strong>Raw Brand</strong> column above — these are what your team typed in the sheet.</li>
          <li>Compare to the <strong>Valid names</strong> above. Names must match exactly (not case-sensitive).</li>
          <li>Fix the value in Column A (Brand) or B (Host) in the Google Sheet.</li>
          <li>Re-run <code className="px-1 rounded" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>syncAll()</code> in Apps Script — the corrected rows will sync and the error will stop appearing.</li>
          <li>Click <strong>Dismiss</strong> once you&apos;ve fixed the row, or <strong>Dismiss all</strong> to clear everything.</li>
        </ol>
      </div>
    </div>
  );
}
