"use client";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlatformBadge } from "@/components/ui/platform-badge";
import { Upload, FileText, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { format } from "date-fns";
// ExcelJS loaded dynamically only when processing a file (it's ~1MB)

interface Batch { id: string; platform: string; fileName: string; period: string; rowCount: number; createdAt: string; }

export default function ImportPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [platform, setPlatform] = useState<"TIKTOK" | "SHOPEE">("TIKTOK");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ total: number; matched: number } | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadBatches() {
    const res = await fetch("/api/import");
    setBatches(await res.json());
  }
  useEffect(() => { loadBatches(); }, []);

  async function handleUpload() {
    if (!file) return;
    setLoading(true); setError(""); setResult(null);

    const formData = new FormData();
    formData.set("platform", platform);
    formData.set("file", file);

    if (platform === "TIKTOK" && file.name.endsWith(".xlsx")) {
      try {
        const buf = await file.arrayBuffer();
        const ExcelJS = await import("exceljs");
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf);
        const ws = wb.worksheets[0];
        const parsedRows: { title: string; startTime: string; duration: string; directGmv: string }[] = [];
        let headerRow = -1;
        ws.eachRow((row, rowNumber) => {
          const vals = row.values as (string | null)[];
          if (headerRow === -1 && vals.some((v) => String(v || "").includes("Livestream"))) {
            headerRow = rowNumber; return;
          }
          if (headerRow > 0 && rowNumber > headerRow) {
            const title = String(vals[1] || "").trim();
            const startTime = vals[2];
            const duration = vals[3];
            const directGmv = String(vals[5] || "0").trim();
            if (title && startTime) {
              const startStr = (startTime as unknown) instanceof Date
                ? (startTime as unknown as Date).toISOString()
                : String(startTime);
              parsedRows.push({ title, startTime: startStr, duration: String(duration || "0"), directGmv });
            }
          }
        });
        formData.set("parsedRows", JSON.stringify(parsedRows));
        formData.set("file", new Blob([" "], { type: "text/plain" }), file.name);
      } catch {
        setError("Failed to parse Excel file. Make sure it's a valid .xlsx");
        setLoading(false);
        return;
      }
    }

    const res = await fetch("/api/import", { method: "POST", body: formData });
    const data = await res.json();
    setLoading(false);
    if (data.ok) { setResult(data); setFile(null); if (fileRef.current) fileRef.current.value = ""; loadBatches(); }
    else setError(data.error || "Upload failed");
  }

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Import Performance Data</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Upload TikTok or Shopee livestream export files to reconcile sessions.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Panel */}
        <div className="section-card p-5 space-y-4">
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>Upload File</h2>

          {/* Platform Toggle */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            {(["TIKTOK", "SHOPEE"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className="flex-1 py-2 text-sm font-medium transition-colors cursor-pointer"
                style={platform === p
                  ? { background: p === "TIKTOK" ? "var(--text-primary)" : "#f97316", color: "#fff" }
                  : { background: "var(--bg-card)", color: "var(--text-secondary)" }
                }
              >
                {p === "TIKTOK" ? "🎵 TikTok" : "🛍️ Shopee"}
              </button>
            ))}
          </div>

          {/* Instructions */}
          <div className="alert alert-info">
            <Info size={13} className="mt-0.5 flex-shrink-0" />
            {platform === "TIKTOK"
              ? <span><strong>TikTok:</strong> Export from TikTok Seller Center → Live Centre → Livestream History. Download as <code>.xlsx</code>. The app reads &quot;Livestream&quot;, &quot;Start time&quot;, &quot;Duration&quot;, and <strong>Direct GMV</strong> columns.</span>
              : <span><strong>Shopee:</strong> Export from Shopee Live → Reports → Download as <code>.csv</code>. The app uses <strong>Sales(Confirmed Order)</strong> as GMV.</span>
            }
          </div>

          {/* File Drop */}
          <div
            className="rounded-xl p-8 text-center cursor-pointer transition-colors"
            style={{
              border: `2px dashed ${file ? "var(--accent)" : "var(--border)"}`,
              background: file ? "var(--accent-light)" : "transparent",
            }}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={28} className="mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
            {file ? (
              <div>
                <div className="font-medium" style={{ color: "var(--text-primary)" }}>{file.name}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{(file.size / 1024).toFixed(0)} KB</div>
              </div>
            ) : (
              <div>
                <div className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Click to select file</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{platform === "TIKTOK" ? ".xlsx" : ".csv"} files</div>
              </div>
            )}
            <input ref={fileRef} type="file" accept={platform === "TIKTOK" ? ".xlsx" : ".csv"} className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>

          {result && (
            <div className="alert alert-success">
              <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <strong>{result.total} rows imported</strong> — <strong>{result.matched}</strong> sessions matched &amp; updated.
                {result.matched < result.total && (
                  <span> {result.total - result.matched} rows had no matching scheduled session (check host display names).</span>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="alert alert-danger">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          <Button onClick={handleUpload} loading={loading} disabled={!file} className="w-full">
            <Upload size={14} /> Upload &amp; Process
          </Button>
        </div>

        {/* How matching works */}
        <div className="space-y-4">
          <div className="section-card p-5">
            <h2 className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>How Matching Works</h2>
            <ol className="space-y-2.5 text-sm" style={{ color: "var(--text-secondary)" }}>
              {[
                <>Host name is extracted from session title (e.g. &quot;TEFAL SALE - <strong>TAUFIQ</strong>&quot;)</>,
                <>Matched to a host whose <strong>Display Name</strong> matches (set in Hosts page)</>,
                <>Finds the closest scheduled session (within ±2 hours)</>,
                <>Updates GMV, actual start time, and marks punctuality</>,
              ].map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span
                    className="w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold flex-shrink-0"
                    style={{ background: "var(--accent-light)", color: "var(--accent-text)" }}
                  >
                    {i + 1}
                  </span>
                  {item}
                </li>
              ))}
            </ol>
          </div>

          <div
            className="rounded-xl p-4 text-sm"
            style={{ background: "var(--warning-light)", border: "1px solid var(--warning)", color: "var(--warning-text)" }}
          >
            <strong>Punctuality Rules:</strong>
            <ul className="mt-1.5 space-y-1 text-xs">
              <li>✦ <strong>Early</strong>: Started 5+ min before scheduled time</li>
              <li>✦ <strong>On Time</strong>: Started within 5 min before scheduled time</li>
              <li>✦ <strong>Late</strong>: Started after scheduled time</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Upload History */}
      <div className="section-card">
        <div className="section-card-header">
          <h2>Upload History</h2>
        </div>
        <div>
          {batches.length === 0 && (
            <div className="empty-state">
              <FileText size={24} className="mx-auto mb-2 opacity-40" />
              No imports yet
            </div>
          )}
          {batches.map((b) => (
            <div key={b.id} className="session-row">
              <PlatformBadge platform={b.platform} showName size="sm" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate" style={{ color: "var(--text-primary)" }}>{b.fileName}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>{b.period}</div>
              </div>
              <Badge variant="secondary">{b.rowCount} rows</Badge>
              <div className="text-xs flex-shrink-0" style={{ color: "var(--text-muted)" }}>
                {format(new Date(b.createdAt), "dd MMM HH:mm")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
