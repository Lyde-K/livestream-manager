"use client";
import { useState, useEffect, useRef } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, AlertTriangle, RefreshCw, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

interface Brand { id: string; name: string; color: string; }

interface PreviewRow {
  roomId: string;
  roomTitle: string;
  startMYT: string;
  endMYT: string;
  hostId: string | null;
  hostName: string | null;
  isCampaign: boolean;
  campaignName: string | null;
  gmv: number;
  duration: number | null;
  likelyTest: boolean;
}

interface Host { id: string; displayName: string; }

// ── Parse TikTok export xlsx client-side ─────────────────────────────────────

async function parseTikTokFile(file: File) {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("No sheet found");

  const rows: Record<string, string>[] = [];
  const HEADERS = [
    "roomId","roomTitle","startTime","endTime","duration","gmv",
    "itemsSold","orders","skuOrders","customers","aov","views",
    "impressions","impressionsPerHour","gmvPerHour","showGpm","watchGpm",
    "avgViewDurationPerView","avgViewDuration","tapThroughRate","liveCtr",
    "productImpressions","productClicks","ctr","ctor","ctorSku","skuOrderRate",
    "newFollowers","followRate","comments","commentRate","shares","shareRate",
    "likes","likeRate",
  ];

  ws.eachRow({ includeEmpty: false }, (row, n) => {
    // Row 1 = date range header, Row 2 = empty, Row 3 = column headers, Row 4+ = data
    if (n < 4) return;
    const vals = (row.values as unknown[]).slice(1);
    if (!vals[0]) return; // skip empty rows
    const obj: Record<string, string> = {};
    HEADERS.forEach((h, i) => { obj[h] = String(vals[i] ?? "").trim(); });
    rows.push(obj);
  });

  return rows;
}

async function parseAdsCostFile(file: File) {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("No sheet found");

  const rows: { roomId: string; cost: string; netCost: string; grossRevenue: string; roi: string }[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n < 2) return;
    const vals = (row.values as unknown[]).slice(1);
    if (!vals[0]) return;
    rows.push({
      roomId:       String(vals[0] ?? "").trim(),
      cost:         String(vals[5] ?? "").trim(),
      netCost:      String(vals[6] ?? "").trim(),
      grossRevenue: String(vals[9] ?? "").trim(),
      roi:          String(vals[10] ?? "").trim(),
    });
  });
  return rows;
}

function fmtMYT(iso: string) {
  return new Date(iso).toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function fmtRM(n: number) {
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

type Step = "upload" | "preview" | "done";

export default function LivestreamImportPage() {
  const [brands, setBrands]           = useState<Brand[]>([]);
  const [hosts, setHosts]             = useState<Host[]>([]);
  const [brandId, setBrandId]         = useState("");
  const [month, setMonth]             = useState(thisMonth());
  const [sessionsFile, setSessionsFile] = useState<File | null>(null);
  const [adsCostFile, setAdsCostFile] = useState<File | null>(null);
  const [step, setStep]               = useState<Step>("upload");
  const [preview, setPreview]         = useState<PreviewRow[]>([]);
  const [hostOverrides, setHostOverrides] = useState<Record<string, string>>({});
  const [excludeTests, setExcludeTests]   = useState(true);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [result, setResult]           = useState<{ inserted: number; skipped: number; unmatched: number; adsCostMatched?: number } | null>(null);

  const sessionsRef = useRef<HTMLInputElement>(null);
  const adsCostRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/brands").then(r => r.json()).then((b: Brand[]) => setBrands(b.filter(x => x)));
    fetch("/api/hosts").then(r => r.json()).then((d: (Host & { displayName: string })[]) => {
      setHosts(d.map(h => ({ id: h.id, displayName: h.displayName })));
    });
  }, []);

  async function handlePreview() {
    if (!brandId || !month || !sessionsFile) { setError("Select brand, month, and session file"); return; }
    setError(""); setLoading(true);
    try {
      const rows = await parseTikTokFile(sessionsFile);
      const res  = await fetch("/api/import/livestream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", brandId, month, rows }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Preview failed"); return; }
      setPreview(data.preview);
      setHostOverrides({});
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally { setLoading(false); }
  }

  async function handleConfirm() {
    setError(""); setLoading(true);
    try {
      // Apply host overrides to rows before re-sending
      const rows = await parseTikTokFile(sessionsFile!);

      // Apply overrides: replace hostId in preview then re-POST with confirm
      const overriddenPreview = preview.map((p) => ({
        ...p,
        hostId:   hostOverrides[p.roomId] ?? p.hostId,
        hostName: hostOverrides[p.roomId]
          ? (hosts.find(h => h.id === hostOverrides[p.roomId])?.displayName ?? p.hostName)
          : p.hostName,
      }));

      // Filter rows to only include those not excluded
      const activeRows = rows.filter((r, i) => {
        const p = overriddenPreview[i];
        if (!p) return false;
        if (excludeTests && p.likelyTest) return false;
        return true;
      });

      const res = await fetch("/api/import/livestream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", brandId, month, rows: activeRows, hostOverrides }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Import failed"); return; }

      let adsCostMatched = 0;
      // Patch ads cost if file provided
      if (adsCostFile) {
        const adsCostRows = await parseAdsCostFile(adsCostFile);
        const patchRes = await fetch("/api/import/livestream", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: adsCostRows }),
        });
        const patchData = await patchRes.json();
        adsCostMatched = patchData.matched ?? 0;
      }

      setResult({ ...data, adsCostMatched });
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally { setLoading(false); }
  }

  function reset() {
    setStep("upload"); setPreview([]); setHostOverrides({});
    setSessionsFile(null); setAdsCostFile(null); setResult(null); setError("");
    if (sessionsRef.current) sessionsRef.current.value = "";
    if (adsCostRef.current) adsCostRef.current.value = "";
  }

  const visiblePreview = excludeTests ? preview.filter(p => !p.likelyTest) : preview;
  const unmatchedRows  = visiblePreview.filter(p => !(hostOverrides[p.roomId] ?? p.hostId));
  const testCount      = preview.filter(p => p.likelyTest).length;

  return (
    <div className="space-y-6 animate-in max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(249,115,22,.12)" }}>
          <Upload size={16} style={{ color: "#f97316" }} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Livestream Import</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Upload TikTok session export · hosts matched from title · campaign days auto-detected
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs font-semibold">
        {(["upload","preview","done"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full"
              style={step === s
                ? { background: "var(--accent)", color: "#fff" }
                : { background: "var(--bg-subtle)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
              {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
            {i < 2 && <ChevronRight size={12} style={{ color: "var(--text-muted)" }} />}
          </div>
        ))}
      </div>

      {/* ── STEP 1: Upload ── */}
      {step === "upload" && (
        <div className="section-card p-5 space-y-5 max-w-2xl">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Brand</label>
              <Select value={brandId} onChange={e => setBrandId(e.target.value)}>
                <option value="">Select brand…</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Month</label>
              <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
            </div>
          </div>

          <FileSlot
            label="TikTok Session Export (.xlsx)"
            hint="Creator Live Performance export — all sessions for this brand's account"
            file={sessionsFile}
            onPick={setSessionsFile}
            inputRef={sessionsRef}
            required
          />

          <FileSlot
            label="Ads Cost Export (.xlsx) — optional"
            hint="Livestream campaign data export — matched by Room ID to fill ads cost per session"
            file={adsCostFile}
            onPick={setAdsCostFile}
            inputRef={adsCostRef}
          />

          {error && <ErrorBanner message={error} />}

          <div className="flex justify-end">
            <Button onClick={handlePreview} loading={loading} disabled={!brandId || !sessionsFile}>
              Preview import <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Preview ── */}
      {step === "preview" && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="section-card px-4 py-3 flex items-center gap-6 flex-wrap">
            <Stat label="Total sessions" value={preview.length} />
            <Stat label="Host matched" value={preview.filter(p => p.hostId).length} color="#22c55e" />
            <Stat label="Unmatched" value={unmatchedRows.length} color={unmatchedRows.length > 0 ? "#ef4444" : undefined} />
            <Stat label="Campaign days" value={visiblePreview.filter(p => p.isCampaign).length} color="#a855f7" />
            {testCount > 0 && <Stat label="Test sessions (<15min)" value={testCount} color="#f59e0b" />}
            <div className="ml-auto flex items-center gap-2">
              {testCount > 0 && (
                <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                  <input type="checkbox" checked={excludeTests} onChange={e => setExcludeTests(e.target.checked)} />
                  Exclude test sessions
                </label>
              )}
            </div>
          </div>

          {unmatchedRows.length > 0 && (
            <div className="section-card px-4 py-3 flex gap-3 items-start"
              style={{ background: "rgba(239,68,68,.06)", borderColor: "rgba(239,68,68,.2)" }}>
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" style={{ color: "#ef4444" }} />
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                <strong style={{ color: "#ef4444" }}>{unmatchedRows.length} session{unmatchedRows.length !== 1 ? "s" : ""} could not be matched to a host.</strong>{" "}
                Assign a host below before confirming — unassigned sessions will be skipped.
              </p>
            </div>
          )}

          {/* Preview table */}
          <div className="section-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{ background: "var(--bg-subtle)", borderBottom: "1px solid var(--border)" }}>
                    {["Title","Start (MYT)","End (MYT)","Duration","Host","Campaign","GMV"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-secondary)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visiblePreview.map((p) => {
                    const assignedHostId = hostOverrides[p.roomId] ?? p.hostId;
                    const assignedHostName = assignedHostId
                      ? (hosts.find(h => h.id === assignedHostId)?.displayName ?? p.hostName)
                      : null;

                    return (
                      <tr key={p.roomId}
                        className="border-b"
                        style={{
                          borderColor: "var(--border)",
                          background: p.likelyTest ? "rgba(245,158,11,.04)" : undefined,
                        }}>
                        <td className="px-3 py-2 max-w-[200px]">
                          <p className="truncate font-medium" style={{ color: "var(--text-primary)" }}>{p.roomTitle}</p>
                          <p className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>{p.roomId.slice(-8)}</p>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{fmtMYT(p.startMYT)}</td>
                        <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{fmtMYT(p.endMYT)}</td>
                        <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                          {p.duration ? `${Math.floor(p.duration / 60)}h${String(p.duration % 60).padStart(2, "0")}m` : "—"}
                          {p.likelyTest && <span className="ml-1 px-1 rounded text-[9px] font-bold" style={{ background: "rgba(245,158,11,.15)", color: "#f59e0b" }}>TEST</span>}
                        </td>
                        <td className="px-3 py-2">
                          {assignedHostName ? (
                            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{assignedHostName}</span>
                          ) : (
                            <Select
                              value={hostOverrides[p.roomId] ?? ""}
                              onChange={e => setHostOverrides(prev => ({ ...prev, [p.roomId]: e.target.value }))}
                            >
                              <option value="">Assign host…</option>
                              {hosts.map(h => <option key={h.id} value={h.id}>{h.displayName}</option>)}
                            </Select>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {p.isCampaign ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: "rgba(168,85,247,.12)", color: "#a855f7" }}>
                              {p.campaignName ?? "CAMP"}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-semibold" style={{ color: "var(--text-primary)" }}>
                          {fmtRM(p.gmv)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {error && <ErrorBanner message={error} />}

          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep("upload")}>← Back</Button>
            <Button
              onClick={handleConfirm}
              loading={loading}
              disabled={unmatchedRows.length > 0 && unmatchedRows.some(p => !(hostOverrides[p.roomId]))}
            >
              <CheckCircle2 size={14} />
              Confirm import ({visiblePreview.filter(p => (hostOverrides[p.roomId] ?? p.hostId)).length} sessions)
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Done ── */}
      {step === "done" && result && (
        <div className="section-card p-8 max-w-md space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={24} style={{ color: "#22c55e" }} />
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Import complete</h2>
          </div>
          <div className="space-y-2">
            <KV label="Sessions imported" value={String(result.inserted)} />
            <KV label="Test sessions skipped" value={String(result.skipped)} />
            <KV label="Unmatched (skipped)" value={String(result.unmatched)} />
            {result.adsCostMatched !== undefined && (
              <KV label="Ads cost patched" value={`${result.adsCostMatched} sessions`} />
            )}
          </div>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Data is live in the dashboard. Previous {month} TikTok import data for this brand has been replaced.
            Google Sheets synced data and other months are untouched.
          </p>
          <div className="flex gap-2 pt-2">
            <Button onClick={reset}>Import another month</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FileSlot({ label, hint, file, onPick, inputRef, required }: {
  label: string; hint: string; file: File | null;
  onPick: (f: File | null) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
        {label} {required && <span style={{ color: "#ef4444" }}>*</span>}
      </label>
      <div className="flex items-center gap-2">
        <label className="flex-1 px-3 py-2 rounded-lg text-sm cursor-pointer flex items-center gap-2"
          style={{ background: "var(--bg-subtle)", border: `1px solid ${file ? "var(--accent)" : "var(--border)"}` }}>
          <FileText size={14} style={{ color: file ? "var(--accent)" : "var(--text-muted)" }} />
          <span style={{ color: file ? "var(--text-primary)" : "var(--text-muted)" }}>
            {file?.name ?? "Choose .xlsx file…"}
          </span>
          <input ref={inputRef} type="file" accept=".xlsx" className="hidden"
            onChange={e => onPick(e.target.files?.[0] ?? null)} />
        </label>
        {file && (
          <button onClick={() => { onPick(null); if (inputRef.current) inputRef.current.value = ""; }}
            className="p-1.5 rounded-lg" style={{ color: "var(--text-muted)", background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
            <X size={13} />
          </button>
        )}
      </div>
      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{hint}</p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-sm"
      style={{ background: "rgba(239,68,68,.08)", color: "#ef4444" }}>
      <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div className="text-lg font-bold" style={{ color: color ?? "var(--text-primary)" }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm py-1" style={{ borderBottom: "1px solid var(--border)" }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}
