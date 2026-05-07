"use client";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  month: number; // 0-indexed
  year: number;
  isMTD: boolean;
  brand?: string; // optional brandId to preserve in navigation
}

export function MonthSelector({ month, year, isMTD, brand }: Props) {
  const router = useRouter();

  function buildUrl(m: number, y: number) {
    const params = new URLSearchParams({ month: String(m), year: String(y) });
    if (brand) params.set("brand", brand);
    return `/?${params.toString()}`;
  }

  function go(offsetMonths: number) {
    const d = new Date(year, month + offsetMonths, 1);
    router.push(buildUrl(d.getMonth(), d.getFullYear()));
  }

  function onSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const [m, y] = e.target.value.split("-").map(Number);
    router.push(buildUrl(m, y));
  }

  // Build last 18 months as options
  const now = new Date();
  const options: { month: number; year: number; label: string }[] = [];
  for (let i = 0; i < 18; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({ month: d.getMonth(), year: d.getFullYear(), label: format(d, "MMMM yyyy") });
  }

  const isCurrentMonth = month === now.getMonth() && year === now.getFullYear();
  const isOldest = options[options.length - 1];
  const canGoBack = !(month === isOldest.month && year === isOldest.year);
  const canGoForward = !isCurrentMonth;

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => go(-1)}
        disabled={!canGoBack}
        className="p-1 rounded-md transition-colors disabled:opacity-30"
        style={{ color: "var(--text-secondary)", background: "var(--bg-subtle)", border: "1px solid var(--border)" }}
      >
        <ChevronLeft size={14} />
      </button>

      <select
        value={`${month}-${year}`}
        onChange={onSelect}
        className="text-sm font-semibold px-2 py-1 rounded-md outline-none cursor-pointer"
        style={{
          background: "var(--bg-subtle)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
        }}
      >
        {options.map(o => (
          <option key={`${o.month}-${o.year}`} value={`${o.month}-${o.year}`}>
            {o.label}
          </option>
        ))}
      </select>

      <button
        onClick={() => go(1)}
        disabled={!canGoForward}
        className="p-1 rounded-md transition-colors disabled:opacity-30"
        style={{ color: "var(--text-secondary)", background: "var(--bg-subtle)", border: "1px solid var(--border)" }}
      >
        <ChevronRight size={14} />
      </button>

      {isMTD && (
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ background: "rgba(99,102,241,0.12)", color: "var(--accent)", border: "1px solid rgba(99,102,241,0.25)" }}>
          MTD
        </span>
      )}
    </div>
  );
}
