"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface BrandOption {
  id: string;
  name: string;
  color: string;
}

interface BrandSelectProps {
  value: string;
  onChange: (brandId: string) => void;
  brands: BrandOption[];
  loading?: boolean;
  showAll?: boolean;
}

export function BrandSelect({
  value,
  onChange,
  brands,
  loading = false,
  showAll = true,
}: BrandSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = brands.find((b) => b.id === value);
  const label = !value ? "All brands" : (selected?.name ?? "All brands");
  const dot = !value ? null : selected?.color ?? null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors cursor-pointer hover:[background:var(--bg-hover)] disabled:opacity-60 disabled:cursor-default"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
          minWidth: "180px",
          justifyContent: "space-between",
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          {dot && (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: dot }}
            />
          )}
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown
          size={14}
          style={{ color: "var(--text-muted)" }}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-50 rounded-lg overflow-hidden max-h-72 overflow-y-auto"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-lg)",
            minWidth: "240px",
          }}
          role="listbox"
        >
          {showAll && (
            <BrandOptionRow
              label="All brands"
              selected={!value}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            />
          )}
          {brands.length === 0 && !loading && (
            <div
              className="px-3 py-2 text-[12px]"
              style={{ color: "var(--text-muted)" }}
            >
              No brands available
            </div>
          )}
          {brands.map((b) => (
            <BrandOptionRow
              key={b.id}
              label={b.name}
              color={b.color}
              selected={b.id === value}
              onClick={() => {
                onChange(b.id);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BrandOptionRow({
  label,
  color,
  selected,
  onClick,
}: {
  label: string;
  color?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-left transition-colors cursor-pointer hover:[background:var(--bg-hover)]"
      style={{
        color: selected ? "var(--text-primary)" : "var(--text-secondary)",
        fontWeight: selected ? 600 : 400,
      }}
      role="option"
      aria-selected={selected}
    >
      {color ? (
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: color }}
        />
      ) : (
        <span className="w-2 h-2 flex-shrink-0" />
      )}
      <span className="flex-1 truncate">{label}</span>
      {selected && (
        <Check size={12} style={{ color: "var(--accent)" }} />
      )}
    </button>
  );
}
