"use client";
import { useEffect, useState } from "react";
import { Loader2, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { formatCurrency } from "@/lib/utils";
import { funnelLabel, metricLabel, tierColor } from "./format";

interface DetailResponse {
  session: {
    id: string;
    platform: "TIKTOK" | "SHOPEE";
    brand: { name: string; color: string } | null;
    host: { displayName: string } | null;
    actualStart: string | null;
    actualEnd: string | null;
    actualDurationMinutes: number | null;
    gmv: number;
    adsCost: number;
  };
  analysis: {
    tier: string;
    funnelStage: string;
    priority: string;
    metrics: Record<string, number | null>;
    exceptionalFlags: { metric: string; value: number; threshold: number }[];
    underperformingFlags: { metric: string; value: number; threshold: number }[];
    analysisDepth: "FULL" | "LIMITED";
    benchmarkSource: "BRAND_PLATFORM" | "PLATFORM_FALLBACK";
  };
  benchmarks: Record<string, { median: number; p15: number; p85: number }>;
  narrative: { reasoning: string; causes: string[]; actionPlan: string[] };
}

export function SessionDetailModal({
  sessionId,
  open,
  onClose,
}: {
  sessionId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !sessionId) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/intelligence/sessions/${sessionId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load");
        return r.json();
      })
      .then((j: DetailResponse) => setData(j))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sessionId, open]);

  return (
    <Modal open={open} onClose={onClose} size="xl" title="Session diagnosis">
      {loading && (
        <div
          className="flex items-center justify-center py-12 gap-3"
          style={{ color: "var(--text-muted)" }}
        >
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Analysing session…</span>
        </div>
      )}

      {error && (
        <div
          className="rounded-lg p-4 text-sm"
          style={{
            background: "var(--danger-light)",
            color: "var(--danger-text)",
          }}
        >
          {error}
        </div>
      )}

      {data && <DetailBody data={data} />}
    </Modal>
  );
}

function DetailBody({ data }: { data: DetailResponse }) {
  const tc = tierColor(data.analysis.tier);
  const { session, analysis, benchmarks, narrative } = data;
  const durationHr = session.actualDurationMinutes
    ? (session.actualDurationMinutes / 60).toFixed(1)
    : "—";

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <div
          className="rounded-xl px-4 py-3 flex-shrink-0"
          style={{ background: tc.bg }}
        >
          <div
            className="text-[10px] font-medium uppercase tracking-wider"
            style={{ color: tc.text }}
          >
            Tier
          </div>
          <div
            className="text-[18px] font-bold leading-tight mt-1"
            style={{ color: tc.text }}
          >
            {tc.label}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {session.brand && (
              <span
                className="inline-flex items-center gap-2 text-[14px] font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: session.brand.color }}
                />
                {session.brand.name}
              </span>
            )}
            <span
              className="text-[10px] uppercase font-medium px-2 py-0.5 rounded"
              style={{
                background: "var(--bg-subtle)",
                color: "var(--text-muted)",
              }}
            >
              {session.platform}
            </span>
            {analysis.analysisDepth === "LIMITED" && (
              <span
                className="text-[10px] uppercase font-medium px-2 py-0.5 rounded"
                style={{
                  background: "var(--warning-light)",
                  color: "var(--warning-text)",
                }}
              >
                Limited data
              </span>
            )}
            {analysis.benchmarkSource === "PLATFORM_FALLBACK" && (
              <span
                className="text-[10px] uppercase font-medium px-2 py-0.5 rounded"
                style={{
                  background: "var(--bg-subtle)",
                  color: "var(--text-muted)",
                }}
              >
                Platform-wide benchmark
              </span>
            )}
          </div>
          <div
            className="text-[12px] mt-1 flex items-center gap-2 flex-wrap"
            style={{ color: "var(--text-secondary)" }}
          >
            {session.host?.displayName && (
              <span>{session.host.displayName}</span>
            )}
            <span>·</span>
            <span>{durationHr}h live</span>
            <span>·</span>
            <span>{formatCurrency(session.gmv)} GMV</span>
            {session.adsCost > 0 && (
              <>
                <span>·</span>
                <span>{formatCurrency(session.adsCost)} ad spend</span>
              </>
            )}
          </div>
          <div
            className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded"
            style={{
              background: "var(--accent-light)",
              color: "var(--accent-text)",
            }}
          >
            <Sparkles size={11} />
            Bottleneck: {funnelLabel(analysis.funnelStage)}
          </div>
        </div>
      </div>

      {narrative.reasoning && (
        <div
          className="rounded-xl p-4"
          style={{
            background: "var(--bg-subtle)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            className="text-[10px] font-semibold uppercase tracking-wider mb-2"
            style={{ color: "var(--text-muted)" }}
          >
            What happened
          </div>
          <p
            className="text-[13.5px] leading-relaxed"
            style={{ color: "var(--text-primary)" }}
          >
            {narrative.reasoning}
          </p>
        </div>
      )}

      {narrative.actionPlan.length > 0 && (
        <div
          className="rounded-xl p-4"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            className="text-[10px] font-semibold uppercase tracking-wider mb-3"
            style={{ color: "var(--text-muted)" }}
          >
            Try this next stream
          </div>
          <ul className="space-y-2">
            {narrative.actionPlan.map((action, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                  style={{
                    background: "var(--accent-light)",
                    color: "var(--accent-text)",
                  }}
                >
                  {i + 1}
                </span>
                <span
                  className="text-[13px] leading-relaxed"
                  style={{ color: "var(--text-primary)" }}
                >
                  {action}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {narrative.causes.length > 0 && (
        <div>
          <div
            className="text-[10px] font-semibold uppercase tracking-wider mb-2"
            style={{ color: "var(--text-muted)" }}
          >
            Why this likely happened
          </div>
          <div className="flex flex-wrap gap-2">
            {narrative.causes.map((c, i) => (
              <span
                key={i}
                className="text-[12px] px-2.5 py-1 rounded-md"
                style={{
                  background: "var(--bg-subtle)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                }}
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <FlagBlock
          title="Strengths vs cohort"
          flags={analysis.exceptionalFlags}
          benchmarks={benchmarks}
          variant="up"
        />
        <FlagBlock
          title="Weaknesses vs cohort"
          flags={analysis.underperformingFlags}
          benchmarks={benchmarks}
          variant="down"
        />
      </div>
    </div>
  );
}

function FlagBlock({
  title,
  flags,
  benchmarks,
  variant,
}: {
  title: string;
  flags: { metric: string; value: number; threshold: number }[];
  benchmarks: Record<string, { median: number; p15: number; p85: number }>;
  variant: "up" | "down";
}) {
  const Icon = variant === "up" ? TrendingUp : TrendingDown;
  const color =
    variant === "up" ? "var(--success-text)" : "var(--danger-text)";
  const bg =
    variant === "up" ? "var(--success-light)" : "var(--danger-light)";
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ background: bg }}
        >
          <Icon size={12} style={{ color }} />
        </div>
        <span
          className="text-[12px] font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </span>
      </div>
      {flags.length === 0 ? (
        <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          None flagged.
        </div>
      ) : (
        <ul className="space-y-2">
          {flags.map((f) => {
            const bench = benchmarks[f.metric];
            return (
              <li key={f.metric} className="text-[12px]">
                <div
                  className="font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {metricLabel(f.metric)}
                </div>
                <div
                  className="tabular-nums"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {formatMetricValue(f.metric, f.value)}{" "}
                  <span style={{ color: "var(--text-muted)" }}>
                    vs {formatMetricValue(f.metric, f.threshold)} threshold
                    {bench &&
                      ` · median ${formatMetricValue(f.metric, bench.median)}`}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatMetricValue(metric: string, v: number): string {
  if (
    metric === "conversionRate" ||
    metric === "productCtr" ||
    metric === "clickToOrderRate" ||
    metric === "engagementRate" ||
    metric === "atcRate" ||
    metric === "atcToOrderRate"
  ) {
    return `${(v * 100).toFixed(2)}%`;
  }
  if (metric === "avgViewDurationSec") {
    return `${v.toFixed(0)}s`;
  }
  if (metric === "roas") {
    return `${v.toFixed(2)}x`;
  }
  if (
    metric === "gmvPerHour" ||
    metric === "aov" ||
    metric === "revenuePerViewer" ||
    metric === "revenuePerEngagedViewer" ||
    metric === "profitPerHour"
  ) {
    return `RM ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
