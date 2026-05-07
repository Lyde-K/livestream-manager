"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Select } from "@/components/ui/select";
import { LabelChip } from "@/components/affiliate/label-chip";
import { formatCurrency } from "@/lib/utils";
import { Sparkles, ArrowRight, TrendingUp, TrendingDown, Ban } from "lucide-react";

interface Brand { id: string; name: string; color: string; client: { user: { name: string } } | null; }

interface CreatorRow {
  id: string;
  creatorName: string;
  gmv: number;
  estCommission: number;
  roi: number | null;
  videos: number;
  liveStreams: number;
  samplesShipped: number;
  rank: number | null;
  rankDelta: number | null;
  label: string | null;
  brand: { id: string; name: string; color: string };
}

interface ProductRow {
  id: string;
  productName: string;
  gmv: number;
  itemsSold: number;
  roi: number | null;
  tier: string | null;
  brand: { id: string; name: string; color: string };
}

interface OverviewData {
  snapshots: { period: string; gmv: number; videos: number; liveStreams: number; blacklisted: number; creators: number }[];
  latestPeriod: string | null;
  topCreators: CreatorRow[];
  topProducts: ProductRow[];
  labelDistribution: Record<string, number>;
}

const TIER_LABEL: Record<string, string> = { EXCEPTIONAL: "Exceptional", AVERAGE: "Average", UNDERPERFORMING: "Underperforming" };
const TIER_COLOR: Record<string, string> = { EXCEPTIONAL: "#10b981", AVERAGE: "var(--text-secondary)", UNDERPERFORMING: "#ef4444" };

export default function AffiliateAiAnalysisPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState("");
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [productTiers, setProductTiers] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/affiliate/brands")
      .then((r) => r.json())
      .then((d: { brands: Brand[] }) => {
        setBrands(d.brands);
        if (d.brands.length === 1) setBrandId(d.brands[0].id);
      });
  }, []);

  useEffect(() => {
    const url = brandId ? `/api/affiliate/overview?brandId=${brandId}` : "/api/affiliate/overview";
    fetch(url).then((r) => r.json()).then(setOverview);
  }, [brandId]);

  useEffect(() => {
    if (!overview?.latestPeriod) { setProductTiers({}); return; }
    const params = new URLSearchParams({ period: overview.latestPeriod, sortBy: "gmv", sortDir: "desc" });
    if (brandId) params.set("brandId", brandId);
    fetch(`/api/affiliate/products?${params}`)
      .then((r) => r.json())
      .then((d: { rows: ProductRow[] }) => {
        const tally: Record<string, number> = {};
        for (const p of d.rows ?? []) {
          if (p.tier) tally[p.tier] = (tally[p.tier] ?? 0) + 1;
        }
        setProductTiers(tally);
      });
  }, [brandId, overview?.latestPeriod]);

  if (!overview) return <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>;

  if (!overview.latestPeriod) {
    return (
      <div className="space-y-4 animate-in">
        <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <Sparkles size={20} /> Affiliate AI Analysis
        </h1>
        <div className="section-card p-10 text-center">
          <Sparkles size={32} className="mx-auto opacity-30 mb-3" />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Import affiliate data first to see analysis.</p>
        </div>
      </div>
    );
  }

  const labelTotal = Object.values(overview.labelDistribution).reduce((a, b) => a + b, 0);
  const productTotal = Object.values(productTiers).reduce((a, b) => a + b, 0);
  const latest = overview.snapshots[overview.snapshots.length - 1];
  const previous = overview.snapshots[overview.snapshots.length - 2];

  // narrative insights
  const insights: { kind: "good" | "bad" | "neutral"; text: string }[] = [];
  if (latest && previous) {
    const gmvChange = previous.gmv > 0 ? ((latest.gmv - previous.gmv) / previous.gmv) * 100 : 0;
    if (gmvChange > 5) insights.push({ kind: "good", text: `GMV grew ${gmvChange.toFixed(1)}% MoM (RM ${(latest.gmv - previous.gmv).toFixed(0)})` });
    else if (gmvChange < -5) insights.push({ kind: "bad", text: `GMV dropped ${Math.abs(gmvChange).toFixed(1)}% MoM` });
    if (latest.videos > previous.videos) insights.push({ kind: "good", text: `Creator video output grew (+${latest.videos - previous.videos} videos)` });
    if (latest.liveStreams < previous.liveStreams) insights.push({ kind: "bad", text: `Live streams dropped by ${previous.liveStreams - latest.liveStreams}` });
  }
  const blacklisted = overview.labelDistribution["F"] ?? 0;
  if (blacklisted > 0) insights.push({ kind: "bad", text: `${blacklisted} creators flagged F-rank — samples shipped without sufficient output` });
  const stars = overview.labelDistribution["STAR"] ?? 0;
  if (stars > 0) insights.push({ kind: "good", text: `${stars} ⭐ Star creators — top GMV with consistent multi-month output` });
  const aRank = overview.labelDistribution["A"] ?? 0;
  if (aRank > 10) insights.push({ kind: "good", text: `${aRank} A-rank creators delivering ROI ≥ 2x` });

  return (
    <div className="space-y-5 animate-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Sparkles size={20} /> Affiliate AI Analysis
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {overview.latestPeriod} · creator labels and product tiers
          </p>
        </div>
        {brands.length > 1 && (
          <Select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="min-w-[180px]">
            <option value="">All my brands</option>
            {brands.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
          </Select>
        )}
      </div>

      {/* Key insights */}
      {insights.length > 0 && (
        <div className="section-card p-4">
          <div className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Key insights</div>
          <ul className="space-y-2">
            {insights.map((i, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                {i.kind === "good" && <TrendingUp size={14} className="mt-0.5 flex-shrink-0" style={{ color: "#10b981" }} />}
                {i.kind === "bad" && <TrendingDown size={14} className="mt-0.5 flex-shrink-0" style={{ color: "#ef4444" }} />}
                <span style={{ color: "var(--text-primary)" }}>{i.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Creator label breakdown */}
      <div className="section-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Creator labels — {overview.latestPeriod}</div>
          <Link href="/affiliate/creators" className="text-xs flex items-center gap-1" style={{ color: "var(--accent)" }}>
            View all <ArrowRight size={11} />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(["STAR", "A", "B", "F"] as const).map((l) => {
            const count = overview.labelDistribution[l] ?? 0;
            const pct = labelTotal > 0 ? (count / labelTotal) * 100 : 0;
            return (
              <div key={l} className="rounded-lg p-3" style={{ background: "var(--bg-subtle)" }}>
                <LabelChip label={l} />
                <div className="text-xl font-bold mt-2 tabular-nums" style={{ color: "var(--text-primary)" }}>{count.toLocaleString()}</div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{pct.toFixed(1)}% of {labelTotal.toLocaleString()}</div>
                <div className="h-1.5 mt-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                  <div className="h-full" style={{ width: `${pct}%`, background: l === "STAR" ? "#f59e0b" : l === "A" ? "#10b981" : l === "F" ? "#ef4444" : "var(--text-muted)" }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Product tier breakdown */}
      {productTotal > 0 && (
        <div className="section-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Product tiers — {overview.latestPeriod}</div>
            <Link href="/affiliate/products" className="text-xs flex items-center gap-1" style={{ color: "var(--accent)" }}>
              View all <ArrowRight size={11} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(["EXCEPTIONAL", "AVERAGE", "UNDERPERFORMING"] as const).map((t) => {
              const count = productTiers[t] ?? 0;
              const pct = productTotal > 0 ? (count / productTotal) * 100 : 0;
              return (
                <div key={t} className="rounded-lg p-3" style={{ background: "var(--bg-subtle)" }}>
                  <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: TIER_COLOR[t] }}>{TIER_LABEL[t]}</div>
                  <div className="text-xl font-bold mt-1 tabular-nums" style={{ color: "var(--text-primary)" }}>{count}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{pct.toFixed(0)}% of {productTotal} products</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top creators with full ROI */}
      <div className="section-card p-4">
        <div className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Top performers — {overview.latestPeriod}</div>
        <div className="overflow-x-auto -mx-px">
          <table className="w-full text-sm">
            <thead style={{ background: "var(--bg-subtle)" }}>
              <tr>
                <th className="px-2 sm:px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Creator</th>
                <th className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>GMV</th>
                <th className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>ROI</th>
              </tr>
            </thead>
            <tbody>
              {overview.topCreators.map((c) => (
                <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-2 sm:px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <LabelChip label={c.label} />
                      <Link href={`/affiliate/creators/${encodeURIComponent(c.creatorName)}`} className="font-medium hover:underline truncate" style={{ color: "var(--text-primary)" }}>
                        {c.creatorName}
                      </Link>
                    </div>
                  </td>
                  <td className="px-2 sm:px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap" style={{ color: "var(--text-primary)" }} title={formatCurrency(c.gmv)}>{formatCurrency(c.gmv)}</td>
                  <td className="px-2 sm:px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap" style={{ color: c.roi != null && c.roi >= 2 ? "#10b981" : "var(--text-secondary)" }}>
                    {c.roi != null ? `${c.roi.toFixed(1)}x` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {blacklisted > 0 && (
        <Link href="/affiliate/blacklist" className="section-card p-4 flex items-center justify-between hover:bg-[color-mix(in_oklab,var(--accent)_4%,transparent)] transition-colors" style={{ background: "color-mix(in oklab, #ef4444 6%, transparent)" }}>
          <div className="flex items-center gap-3">
            <Ban size={20} style={{ color: "#ef4444" }} />
            <div>
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{blacklisted} blacklisted creators</div>
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>F-rank: samples shipped without content or with no sales</div>
            </div>
          </div>
          <ArrowRight size={16} style={{ color: "var(--text-secondary)" }} />
        </Link>
      )}
    </div>
  );
}
