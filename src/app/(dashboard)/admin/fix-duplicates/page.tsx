"use client";
import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, RefreshCw, Trash2, Info, Flame } from "lucide-react";
import type { DuplicatePair } from "@/app/api/admin/sessions/duplicates/route";

function sgt(iso: string) {
  // Display UTC timestamp in SGT (+08:00)
  const d = new Date(iso);
  return format(new Date(d.getTime() + 8 * 3600_000), "d MMM yyyy HH:mm");
}

export default function FixDuplicatesPage() {
  const [pairs, setPairs]       = useState<DuplicatePair[]>([]);
  const [loading, setLoading]   = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted]   = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [done, setDone]         = useState(false);

  // Clear-all state
  const [syncedCount, setSyncedCount]   = useState<number | null>(null);
  const [clearing, setClearing]         = useState(false);
  const [clearDone, setClearDone]       = useState(false);
  const [clearDeleted, setClearDeleted] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setDone(false);
    const [dupRes, countRes] = await Promise.all([
      fetch("/api/admin/sessions/duplicates"),
      fetch("/api/admin/sessions/clear-synced"),
    ]);
    const dupData   = await dupRes.json();
    const countData = await countRes.json();
    setPairs(dupData.pairs ?? []);
    setSelected(new Set((dupData.pairs ?? []).map((p: DuplicatePair) => p.wrongId)));
    setSyncedCount(countData.count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll(check: boolean) {
    setSelected(check ? new Set(pairs.map(p => p.wrongId)) : new Set());
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`Permanently delete ${ids.length} session(s)? This cannot be undone.`)) return;
    setDeleting(true);
    const res = await fetch("/api/admin/sessions/duplicates", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const data = await res.json();
    setDeleted(data.deleted ?? 0);
    setDeleting(false);
    setDone(true);
    await load();
  }

  async function clearAllSynced() {
    const msg = `This will permanently delete ALL ${syncedCount ?? "?"} Google Sheets synced sessions.\n\nThis cannot be undone. You'll need to resync from Google Sheets.\n\nType DELETE to confirm.`;
    const input = prompt(msg);
    if (input !== "DELETE") return;
    setClearing(true);
    const res = await fetch("/api/admin/sessions/clear-synced", {
      method: "DELETE",
      headers: { "x-confirm-clear": "yes-delete-all-synced" },
    });
    const data = await res.json();
    setClearDeleted(data.deleted ?? 0);
    setClearing(false);
    setClearDone(true);
    await load();
  }

  return (
    <div className="space-y-5 animate-in max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Fix Duplicate Sessions</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Sessions duplicated by the timezone fix — old copies have times shifted +8 hours.
          Review the pairs below, then delete the wrong ones.
        </p>
      </div>

      {/* Explainer */}
      <div className="rounded-xl px-4 py-3 flex gap-3" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
        <Info size={15} className="flex-shrink-0 mt-0.5" style={{ color: "var(--accent)" }} />
        <div className="text-sm space-y-1" style={{ color: "var(--text-secondary)" }}>
          <p><strong style={{ color: "var(--text-primary)" }}>Why did this happen?</strong> Before the timezone fix, session times from Google Sheets were treated as UTC instead of MYT (+08:00), inflating every timestamp by 8 hours. The fix corrected new imports — but each corrected session got a new <code>externalRef</code>, creating a duplicate alongside the old (shifted) one.</p>
          <p><strong style={{ color: "var(--text-primary)" }}>What to do:</strong> Use <strong>Clear All Synced & Resync</strong> below for the cleanest reset, or manually review pairs and delete the wrong ones.</p>
        </div>
      </div>

      {/* Done banner — bulk delete */}
      {done && deleted > 0 && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: "#f0fdf4", border: "1px solid #86efac" }}>
          <CheckCircle2 size={16} style={{ color: "var(--success)" }} />
          <span className="text-sm font-medium" style={{ color: "#166534" }}>
            ✓ {deleted} duplicate session{deleted !== 1 ? "s" : ""} deleted successfully.
          </span>
        </div>
      )}

      {/* Done banner — clear all */}
      {clearDone && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: "#f0fdf4", border: "1px solid #86efac" }}>
          <CheckCircle2 size={16} style={{ color: "var(--success)" }} />
          <span className="text-sm font-medium" style={{ color: "#166534" }}>
            ✓ {clearDeleted} synced session{clearDeleted !== 1 ? "s" : ""} cleared. You can now trigger a fresh sync from Google Sheets.
          </span>
        </div>
      )}

      {/* ── Danger Zone: Clear all synced ─────────────────────────────── */}
      <div className="rounded-xl px-4 py-4 space-y-3" style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.25)" }}>
        <div className="flex items-center gap-2">
          <Flame size={14} style={{ color: "var(--danger)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--danger)" }}>Danger Zone — Clear All Synced Data</span>
        </div>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Wipes <strong style={{ color: "var(--text-primary)" }}>every session imported from Google Sheets</strong> (all records whose ID starts with <code>GS-</code>).
          Use this for a clean slate before a full resync. Manually created sessions are untouched.
        </p>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono px-2 py-1 rounded" style={{ background: "rgba(239,68,68,0.1)", color: "var(--danger)" }}>
            {loading ? "…" : `${syncedCount ?? 0} synced session${syncedCount !== 1 ? "s" : ""} in database`}
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={clearAllSynced}
            loading={clearing}
            disabled={loading || (syncedCount ?? 0) === 0}
          >
            <Trash2 size={13} /> Clear All Synced &amp; Resync
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="section-card p-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          <RefreshCw size={18} className="mx-auto mb-2 animate-spin" />
          Scanning for duplicates…
        </div>
      )}

      {/* No duplicates */}
      {!loading && pairs.length === 0 && (
        <div className="section-card p-10 text-center">
          <CheckCircle2 size={32} className="mx-auto mb-3" style={{ color: "var(--success)" }} />
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>No duplicates found</p>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>All sessions look clean.</p>
        </div>
      )}

      {/* Pairs table */}
      {!loading && pairs.length > 0 && (
        <div className="section-card">
          <div className="section-card-header">
            <h2 className="flex items-center gap-2">
              <AlertTriangle size={14} style={{ color: "var(--warning)" }} />
              {pairs.length} duplicate pair{pairs.length !== 1 ? "s" : ""} found
            </h2>
            <div className="flex items-center gap-2">
              <button className="text-xs font-medium" style={{ color: "var(--accent)" }} onClick={() => toggleAll(true)}>Select all wrong</button>
              <span style={{ color: "var(--text-muted)" }}>·</span>
              <button className="text-xs font-medium" style={{ color: "var(--text-muted)" }} onClick={() => toggleAll(false)}>Clear</button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table text-xs w-full">
              <thead>
                <tr>
                  <th className="w-8">Del</th>
                  <th>Type</th>
                  <th>Host</th>
                  <th>Brand</th>
                  <th>Platform</th>
                  <th>Time (SGT)</th>
                  <th>Has GMV data</th>
                  <th>External Ref</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((p) => (
                  <>
                    {/* Wrong row — pre-checked */}
                    <tr key={`w-${p.wrongId}`} style={{ background: "rgba(239,68,68,0.04)" }}>
                      <td className="text-center">
                        <input
                          type="checkbox"
                          checked={selected.has(p.wrongId)}
                          onChange={() => toggleRow(p.wrongId)}
                          className="cursor-pointer"
                        />
                      </td>
                      <td>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: "rgba(239,68,68,0.12)", color: "var(--danger)" }}>
                          ✗ Wrong (+8h)
                        </span>
                      </td>
                      <td style={{ color: "var(--text-secondary)" }}>{p.host}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{p.brand}</td>
                      <td style={{ color: "var(--text-muted)" }}>{p.platform}</td>
                      <td className="font-mono font-semibold" style={{ color: "var(--danger)" }}>{sgt(p.wrongTime)}</td>
                      <td className="text-center">{p.wrongHasData ? "✓" : "—"}</td>
                      <td className="font-mono text-[10px]" style={{ color: "var(--text-muted)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.wrongRef ?? "—"}
                      </td>
                    </tr>
                    {/* Correct row */}
                    <tr key={`c-${p.correctId}`} style={{ background: "rgba(34,197,94,0.04)", borderBottom: "2px solid var(--border)" }}>
                      <td className="text-center">
                        <input
                          type="checkbox"
                          checked={selected.has(p.correctId)}
                          onChange={() => toggleRow(p.correctId)}
                          className="cursor-pointer"
                        />
                      </td>
                      <td>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: "rgba(34,197,94,0.12)", color: "var(--success)" }}>
                          ✓ Correct
                        </span>
                      </td>
                      <td style={{ color: "var(--text-secondary)" }}>{p.host}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{p.brand}</td>
                      <td style={{ color: "var(--text-muted)" }}>{p.platform}</td>
                      <td className="font-mono font-semibold" style={{ color: "var(--success)" }}>{sgt(p.correctTime)}</td>
                      <td className="text-center">{p.correctHasData ? "✓" : "—"}</td>
                      <td className="font-mono text-[10px]" style={{ color: "var(--text-muted)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.correctRef ?? "—"}
                      </td>
                    </tr>
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action bar */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {selected.size} session{selected.size !== 1 ? "s" : ""} selected for deletion
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={load} loading={loading}>
                <RefreshCw size={13} /> Rescan
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={bulkDelete}
                loading={deleting}
                disabled={selected.size === 0}
              >
                <Trash2 size={13} /> Delete {selected.size > 0 ? selected.size : ""} Selected
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
