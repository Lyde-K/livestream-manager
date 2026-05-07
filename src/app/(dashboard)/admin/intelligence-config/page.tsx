"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Save, Settings2 } from "lucide-react";

interface ConfigValues {
  lowPercentile: number;
  highPercentile: number;
  exceptionalMinTriggers: number;
  underperformingMinTriggers: number;

  roasLowFloor: number;
  roasHighCeiling: number;
  profitPerHourLowFloor: number;
  limitedAnalysisMinTriggers: number;
  excludeMinDurationMinutes: number;
  cohortDays: number;
  cohortMinSize: number;
}

interface DistributionItem {
  tier: string;
  count: number;
  pct: number;
}

const TIER_COLORS: Record<string, string> = {
  EXCEPTIONAL: "#10b981",
  AVERAGE: "#94a3b8",
  UNDERPERFORMING: "#ef4444",
};

const TIER_ORDER = ["EXCEPTIONAL", "AVERAGE", "UNDERPERFORMING"];


const DEFAULTS: ConfigValues = {
  lowPercentile: 0.20,
  highPercentile: 0.80,
  exceptionalMinTriggers: 3,
  underperformingMinTriggers: 3,
  roasLowFloor: 1.5,
  roasHighCeiling: 5.0,
  profitPerHourLowFloor: 0,
  limitedAnalysisMinTriggers: 1,
  excludeMinDurationMinutes: 5,
  cohortDays: 90,
  cohortMinSize: 5,
};

export default function IntelligenceConfigPage() {
  const [config, setConfig] = useState<ConfigValues>(DEFAULTS);
  const [distribution, setDistribution] = useState<DistributionItem[]>([]);
  const [previewTotal, setPreviewTotal] = useState<number | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/intelligence/config")
      .then((r) => r.json())
      .then((data: { global?: ConfigValues | null }) => {
        if (data.global) {
          const { enabledMetrics: _ignored, ...rest } = data.global as ConfigValues & { enabledMetrics?: unknown };
          setConfig({ ...DEFAULTS, ...rest });
        }
      })
      .finally(() => setLoadingConfig(false));
  }, []);

  const runPreview = useCallback(
    (cfg: ConfigValues) => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewTimer.current = setTimeout(() => {
        setLoadingPreview(true);
        fetch("/api/intelligence/config/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(cfg),
        })
          .then((r) => r.json())
          .then(
            (d: { distribution: DistributionItem[]; totalSessions: number }) => {
              setDistribution(d.distribution ?? []);
              setPreviewTotal(d.totalSessions ?? 0);
            },
          )
          .finally(() => setLoadingPreview(false));
      }, 600);
    },
    [],
  );

  useEffect(() => {
    if (!loadingConfig) runPreview(config);
  }, [config, loadingConfig, runPreview]);

  function set<K extends keyof ConfigValues>(k: K, v: ConfigValues[K]) {
    setConfig((prev) => ({ ...prev, [k]: v }));
  }

  async function save() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const r = await fetch("/api/intelligence/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Save failed");
      setSaveMsg({ ok: true, text: `Saved — config version ${d.configVersion}` });
    } catch (e: unknown) {
      setSaveMsg({
        ok: false,
        text: e instanceof Error ? e.message : "Save failed",
      });
    } finally {
      setSaving(false);
    }
  }

  async function recompute() {
    if (!confirm("This will delete all cached session insights and force re-analysis on next view. Continue?")) return;
    setRecomputing(true);
    try {
      await fetch("/api/intelligence/config/recompute", { method: "POST" });
      setSaveMsg({ ok: true, text: "All cached insights cleared — they will regenerate on next view." });
    } finally {
      setRecomputing(false);
    }
  }

  if (loadingConfig) {
    return (
      <div className="flex items-center gap-3 py-12" style={{ color: "var(--text-muted)" }}>
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Loading config…</span>
      </div>
    );
  }

  const sortedDist = TIER_ORDER.map((tier) => {
    const item = distribution.find((d) => d.tier === tier);
    return { tier, count: item?.count ?? 0, pct: item?.pct ?? 0 };
  });

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold" style={{ color: "var(--text-primary)" }}>
            Intelligence config
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
            Adjust tiering rules and thresholds. Changes take effect after Save.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={recompute}
            disabled={recomputing}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[12.5px] font-medium transition-colors cursor-pointer"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
            }}
          >
            <RefreshCw size={13} className={recomputing ? "animate-spin" : ""} />
            Recompute all
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12.5px] font-semibold text-white transition-colors cursor-pointer"
            style={{ background: "var(--accent)" }}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save config
          </button>
        </div>
      </div>

      {saveMsg && (
        <div
          className="rounded-lg px-4 py-3 text-[13px]"
          style={{
            background: saveMsg.ok ? "var(--success-light)" : "var(--danger-light)",
            color: saveMsg.ok ? "var(--success-text)" : "var(--danger-text)",
            border: `1px solid ${saveMsg.ok ? "var(--success-light)" : "var(--danger-light)"}`,
          }}
        >
          {saveMsg.text}
        </div>
      )}

      {/* Live distribution preview */}
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Settings2 size={13} style={{ color: "var(--text-secondary)" }} />
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
            Live distribution preview
          </span>
          {loadingPreview && <Loader2 size={12} className="animate-spin ml-auto" style={{ color: "var(--text-muted)" }} />}
          {previewTotal !== null && !loadingPreview && (
            <span className="text-[11px] ml-auto" style={{ color: "var(--text-muted)" }}>
              {previewTotal.toLocaleString()} sessions
            </span>
          )}
        </div>

        {/* Stacked bar */}
        <div className="h-3 flex rounded-full overflow-hidden mb-4" style={{ background: "var(--bg-subtle)" }}>
          {sortedDist.filter((d) => d.count > 0).map((d) => (
            <div
              key={d.tier}
              style={{ width: `${d.pct * 100}%`, background: TIER_COLORS[d.tier] ?? "#94a3b8" }}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {sortedDist.map((d) => (
            <div
              key={d.tier}
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}
            >
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: TIER_COLORS[d.tier] ?? "#94a3b8" }} />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-medium capitalize" style={{ color: "var(--text-secondary)" }}>
                  {d.tier.charAt(0) + d.tier.slice(1).toLowerCase()}
                </div>
                <div className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {d.count}{" "}
                  <span className="text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>
                    {(d.pct * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Percentile thresholds */}
        <ConfigCard title="Percentile thresholds">
          <SliderField
            label="Low percentile (underperform floor)"
            value={config.lowPercentile}
            min={0.05} max={0.30} step={0.01}
            format={(v) => `${(v * 100).toFixed(0)}%`}
            onChange={(v) => set("lowPercentile", v)}
          />
          <SliderField
            label="High percentile (exceptional ceiling)"
            value={config.highPercentile}
            min={0.70} max={0.95} step={0.01}
            format={(v) => `${(v * 100).toFixed(0)}%`}
            onChange={(v) => set("highPercentile", v)}
          />
        </ConfigCard>

        {/* Trigger counts */}
        <ConfigCard title="Trigger thresholds">
          <StepperField
            label="Triggers for EXCEPTIONAL"
            value={config.exceptionalMinTriggers}
            min={1} max={6}
            onChange={(v) => set("exceptionalMinTriggers", v)}
          />
          <StepperField
            label="Triggers for UNDERPERFORMING"
            value={config.underperformingMinTriggers}
            min={1} max={6}
            onChange={(v) => set("underperformingMinTriggers", v)}
          />
        </ConfigCard>

        {/* TikTok business rules */}
        <ConfigCard title="TikTok absolute rules">
          <SliderField
            label="ROAS low floor (underperform below)"
            value={config.roasLowFloor}
            min={0.5} max={5.0} step={0.1}
            format={(v) => `${v.toFixed(1)}x`}
            onChange={(v) => set("roasLowFloor", v)}
          />
          <SliderField
            label="ROAS high ceiling (exceptional above)"
            value={config.roasHighCeiling}
            min={2.0} max={20.0} step={0.5}
            format={(v) => `${v.toFixed(1)}x`}
            onChange={(v) => set("roasHighCeiling", v)}
          />
          <StepperField
            label="Profit/hour floor (RM, below = underperform)"
            value={config.profitPerHourLowFloor}
            min={-50000} max={50000} step={500}
            format={(v) => `RM ${v.toLocaleString()}`}
            onChange={(v) => set("profitPerHourLowFloor", v)}
          />
        </ConfigCard>

        {/* Cohort & session filters */}
        <ConfigCard title="Cohort & session filters">
          <SelectField
            label="Cohort window (days)"
            value={config.cohortDays}
            options={[30, 60, 90, 180]}
            format={(v) => `${v} days`}
            onChange={(v) => set("cohortDays", v as number)}
          />
          <StepperField
            label="Min cohort size (below → platform-wide fallback)"
            value={config.cohortMinSize}
            min={1} max={20}
            onChange={(v) => set("cohortMinSize", v)}
          />
          <StepperField
            label="Min session duration to include (minutes)"
            value={config.excludeMinDurationMinutes}
            min={0} max={30}
            onChange={(v) => set("excludeMinDurationMinutes", v)}
          />
          <StepperField
            label="Limited-data analysis min triggers"
            value={config.limitedAnalysisMinTriggers}
            min={1} max={5}
            onChange={(v) => set("limitedAnalysisMinTriggers", v)}
          />
        </ConfigCard>

      </div>
    </div>
  );
}

function ConfigCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl p-5 space-y-4 ${className}`}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  format: fmt,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px]" style={{ color: "var(--text-primary)" }}>
          {label}
        </span>
        <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: "var(--accent)" }}>
          {fmt(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full cursor-pointer appearance-none"
        style={{ accentColor: "var(--accent)", background: "var(--bg-subtle)" }}
      />
      <div className="flex justify-between text-[10px]" style={{ color: "var(--text-muted)" }}>
        <span>{fmt(min)}</span>
        <span>{fmt(max)}</span>
      </div>
    </div>
  );
}

function StepperField({
  label,
  value,
  min,
  max,
  step = 1,
  format: fmt = (v) => String(v),
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12.5px] flex-1" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          disabled={value <= min}
          className="w-7 h-7 rounded-md text-[14px] font-bold flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40"
          style={{ background: "var(--bg-subtle)", color: "var(--text-primary)" }}
        >
          −
        </button>
        <span className="text-[13px] font-semibold tabular-nums w-16 text-center" style={{ color: "var(--accent)" }}>
          {fmt(value)}
        </span>
        <button
          onClick={() => onChange(Math.min(max, value + step))}
          disabled={value >= max}
          className="w-7 h-7 rounded-md text-[14px] font-bold flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40"
          style={{ background: "var(--bg-subtle)", color: "var(--text-primary)" }}
        >
          +
        </button>
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  format: fmt = (v) => String(v),
  onChange,
}: {
  label: string;
  value: number;
  options: number[];
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12.5px]" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-md px-2 py-1 text-[12.5px] font-medium cursor-pointer"
        style={{
          background: "var(--bg-subtle)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {fmt(o)}
          </option>
        ))}
      </select>
    </div>
  );
}
