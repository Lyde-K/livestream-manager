interface LabelChipProps {
  label: string | null;
  size?: "sm" | "md";
  showTooltip?: boolean;
}

const STYLES: Record<string, { bg: string; fg: string; text: string }> = {
  STAR: { bg: "color-mix(in oklab, #f59e0b 22%, transparent)", fg: "#f59e0b", text: "⭐ Star" },
  A:    { bg: "color-mix(in oklab, #10b981 18%, transparent)", fg: "#059669", text: "A Rank" },
  B:    { bg: "var(--bg-subtle)", fg: "var(--text-secondary)", text: "B Rank" },
  F:    { bg: "color-mix(in oklab, #ef4444 16%, transparent)", fg: "#ef4444", text: "F Rank" },
};

const TOOLTIPS: Record<string, string> = {
  STAR: "⭐ Star — Top 10% GMV (≥ RM1,000) · ROI ≥ 3x · Consistency ≥ 80% · Top-ranked 3+ consecutive months",
  A:    "A Rank — Top 30% GMV · ROI ≥ 2x · Consistency ≥ 60%",
  B:    "B Rank — GMV > 0 · ROI ≥ 1x (does not qualify for A)",
  F:    "F Rank (Blacklist) — Samples shipped with zero content or zero GMV, or ROI < 1x",
};

export function LabelChip({ label, size = "sm", showTooltip = true }: LabelChipProps) {
  if (!label) return null;
  const style = STYLES[label] ?? STYLES.B;
  const cls =
    size === "sm"
      ? "text-[10px] px-1.5 py-0.5"
      : "text-xs px-2 py-1";
  const tip = showTooltip ? (TOOLTIPS[label] ?? "") : "";
  return (
    <span
      className={`inline-flex items-center rounded-md font-semibold leading-tight ${cls}`}
      style={{ background: style.bg, color: style.fg }}
      title={tip}
    >
      {style.text}
    </span>
  );
}
