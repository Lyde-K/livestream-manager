"use client";
import { useState } from "react";
import { X, Download, Loader2 } from "lucide-react";

interface Props {
  brand: { id: string; name: string };
  month: number;
  year: number;
  onClose: () => void;
}

const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

export function BrandReportModal({ brand, month, year, onClose }: Props) {
  const [notes, setNotes] = useState({ bestPerformance: "", worstImprovement: "", summaryOverview: "", summaryNextSteps: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError]  = useState("");

  async function generate() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/reports/brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: brand.id, month, year, notes }),
      });
      if (!res.ok) { setError("Failed to generate report. Please try again."); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${brand.name}_Report_${MONTHS[month - 1]}_${year}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const textarea = (field: keyof typeof notes, placeholder: string) => (
    <textarea
      rows={3} placeholder={placeholder} value={notes[field]}
      onChange={e => setNotes(n => ({ ...n, [field]: e.target.value }))}
      className="w-full rounded px-3 py-2 text-xs resize-none border"
      style={{ background: "var(--bg-input, var(--bg-card))", borderColor: "var(--border)", color: "var(--text)" }}
    />
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="relative w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ background: "var(--bg)", maxHeight: "90vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>Generate Monthly Report</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{brand.name} · {MONTHS[month - 1]} {year}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:bg-white/10"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 space-y-4 flex-1">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            All metrics are auto-populated from session data. Optionally add written commentary below.
          </p>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Best session — what worked?</p>
              {textarea("bestPerformance", "e.g. Strong campaign promotion, peak hour slot, host energy was high…")}
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Weakest session — improvements?</p>
              {textarea("worstImprovement", "e.g. Low traffic due to off-peak slot, technical issues, limited campaign support…")}
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Summary overview <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(leave blank for auto)</span></p>
              {textarea("summaryOverview", "Auto-generated from data if left blank")}
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Next steps</p>
              {textarea("summaryNextSteps", "e.g. Increase campaign days, test new time slots, focus on product bundling…")}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 shrink-0 flex items-center justify-between gap-4" style={{ borderTop: "1px solid var(--border)" }}>
          {error ? <p className="text-xs" style={{ color: "var(--danger)" }}>{error}</p> : <div />}
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
              Cancel
            </button>
            <button
              onClick={generate}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ background: "#2A2968" }}
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              {loading ? "Generating…" : "Download PPTX"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
