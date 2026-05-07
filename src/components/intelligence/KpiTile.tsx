import type { LucideIcon } from "lucide-react";

interface KpiTileProps {
  label: string;
  value: string;
  sublabel?: string;
  icon?: LucideIcon;
  accent?: "indigo" | "emerald" | "amber" | "rose" | "sky" | "violet";
}

const ACCENTS: Record<string, string> = {
  indigo: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
  emerald: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
  amber: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
  rose: "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)",
  sky: "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)",
  violet: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
};

export function KpiTile({ label, value, sublabel, icon: Icon, accent }: KpiTileProps) {
  if (accent) {
    return (
      <div
        className="rounded-xl p-4 text-white"
        style={{ background: ACCENTS[accent] }}
      >
        <div className="flex items-center justify-between mb-2 opacity-90">
          <span className="text-[11px] font-medium uppercase tracking-wider">
            {label}
          </span>
          {Icon && <Icon size={16} />}
        </div>
        <div className="text-[22px] font-bold tabular-nums leading-tight">
          {value}
        </div>
        {sublabel && (
          <div className="text-[11px] opacity-80 mt-1">{sublabel}</div>
        )}
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[11px] font-medium uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          {label}
        </span>
        {Icon && <Icon size={16} style={{ color: "var(--text-muted)" }} />}
      </div>
      <div
        className="text-[22px] font-bold tabular-nums leading-tight"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </div>
      {sublabel && (
        <div className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
          {sublabel}
        </div>
      )}
    </div>
  );
}
