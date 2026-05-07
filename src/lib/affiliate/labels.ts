import { prisma } from "@/lib/prisma";

export type CreatorLabel = "STAR" | "A" | "B" | "F";

interface CreatorWithRoi {
  id: string;
  creatorName: string;
  gmv: number;
  estCommission: number;
  videos: number;
  liveStreams: number;
  samplesShipped: number;
  roi: number;
}

const STAR_TOP_PCT = 0.10;
const A_TOP_PCT = 0.30;
const STAR_MIN_ROI = 3;
const A_MIN_ROI = 2;
const B_MIN_ROI = 1;
const STAR_MIN_CONSISTENCY = 0.8;
const A_MIN_CONSISTENCY = 0.6;
const STAR_MIN_CONSEC_TOP = 3;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function computeRoi(gmv: number, estCommission: number): number {
  if (estCommission <= 0) return gmv > 0 ? 999 : 0;
  return gmv / estCommission;
}

function isBlacklisted(c: CreatorWithRoi): boolean {
  if (c.samplesShipped <= 0) return false;
  if (c.videos === 0 && c.liveStreams === 0) return true;
  if (c.gmv === 0) return true;
  if (c.roi < B_MIN_ROI) return true;
  return false;
}

interface HistoryRow {
  period: string;
  gmv: number;
  rank: number | null;
}

function consistency(history: HistoryRow[]): number {
  if (history.length === 0) return 0;
  const monthsActive = history.length;
  const monthsWithSales = history.filter((h) => h.gmv > 0).length;
  return monthsWithSales / monthsActive;
}

function consecutiveTopMonths(history: HistoryRow[], topThreshold: number): number {
  const sorted = [...history].sort((a, b) => (a.period < b.period ? 1 : -1));
  let streak = 0;
  for (const row of sorted) {
    if (row.rank != null && row.rank <= topThreshold) streak++;
    else break;
  }
  return streak;
}

export async function recomputeCreatorLabels(brandId: string, period: string): Promise<void> {
  const creators = await prisma.affiliateCreatorStat.findMany({
    where: { brandId, period },
    select: {
      id: true,
      creatorName: true,
      gmv: true,
      estCommission: true,
      videos: true,
      liveStreams: true,
      samplesShipped: true,
    },
  });

  if (creators.length === 0) return;

  const enriched: CreatorWithRoi[] = creators.map((c) => {
    const gmv = Number(c.gmv);
    const commission = Number(c.estCommission);
    return {
      id: c.id,
      creatorName: c.creatorName,
      gmv,
      estCommission: commission,
      videos: c.videos,
      liveStreams: c.liveStreams,
      samplesShipped: c.samplesShipped,
      roi: computeRoi(gmv, commission),
    };
  });

  const sortedByGmv = [...enriched].sort((a, b) => b.gmv - a.gmv);
  const rankByCreator = new Map<string, number>();
  sortedByGmv.forEach((c, i) => rankByCreator.set(c.id, i + 1));

  const gmvSorted = enriched.map((c) => c.gmv).sort((a, b) => b - a);
  const starThreshold = percentile(gmvSorted, STAR_TOP_PCT);
  const aThreshold = percentile(gmvSorted, A_TOP_PCT);
  const topRankCutoff = Math.max(1, Math.ceil(enriched.length * A_TOP_PCT));

  const names = enriched.map((c) => c.creatorName);
  const history = await prisma.affiliateCreatorStat.findMany({
    where: { brandId, creatorName: { in: names } },
    select: { creatorName: true, period: true, gmv: true, rank: true },
  });

  const histByName = new Map<string, HistoryRow[]>();
  for (const h of history) {
    const arr = histByName.get(h.creatorName) ?? [];
    arr.push({ period: h.period, gmv: Number(h.gmv), rank: h.rank });
    histByName.set(h.creatorName, arr);
  }

  // Inject the just-computed rank for the current period so consec/consistency
  // see the correct value. Without this, the row for `period` in DB still has
  // rank=null (just inserted by createMany), the streak loop breaks at null,
  // and STAR is unreachable.
  const enrichedByName = new Map(enriched.map((c) => [c.creatorName, c]));
  for (const [name, hist] of histByName) {
    const c = enrichedByName.get(name);
    if (!c) continue;
    const rank = rankByCreator.get(c.id);
    if (rank == null) continue;
    const idx = hist.findIndex((h) => h.period === period);
    if (idx >= 0) hist[idx] = { period, gmv: c.gmv, rank };
    else hist.push({ period, gmv: c.gmv, rank });
  }

  const updates: { id: string; rank: number; roi: number; label: CreatorLabel }[] = [];

  for (const c of enriched) {
    const rank = rankByCreator.get(c.id)!;
    const hist = histByName.get(c.creatorName) ?? [];
    const cons = consistency(hist);
    const consec = consecutiveTopMonths(hist, topRankCutoff);

    let label: CreatorLabel;
    if (isBlacklisted(c)) {
      label = "F";
    } else if (
      c.gmv >= 1000 &&
      c.gmv >= starThreshold &&
      c.roi >= STAR_MIN_ROI &&
      cons >= STAR_MIN_CONSISTENCY &&
      consec >= STAR_MIN_CONSEC_TOP
    ) {
      label = "STAR";
    } else if (c.gmv >= aThreshold && c.roi >= A_MIN_ROI && cons >= A_MIN_CONSISTENCY) {
      label = "A";
    } else if (c.gmv > 0 && c.roi >= B_MIN_ROI) {
      label = "B";
    } else {
      label = "F";
    }

    updates.push({ id: c.id, rank, roi: c.roi, label });
  }

  const CHUNK = 200;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map((u) =>
        prisma.affiliateCreatorStat.update({
          where: { id: u.id },
          data: { rank: u.rank, roi: u.roi, label: u.label },
        }),
      ),
    );
  }
}

export async function recomputeProductTiers(brandId: string, period: string): Promise<void> {
  const products = await prisma.affiliateProductStat.findMany({
    where: { brandId, period },
    select: { id: true, gmv: true, estCommission: true },
  });
  if (products.length === 0) return;

  const sortedGmv = products.map((p) => Number(p.gmv)).sort((a, b) => b - a);
  const highCutoff = percentile(sortedGmv, 0.20);
  const lowCutoff = percentile(sortedGmv, 0.80);

  const updates = products.map((p) => {
    const gmv = Number(p.gmv);
    const commission = Number(p.estCommission);
    const roi = computeRoi(gmv, commission);
    let tier: string;
    if (gmv >= highCutoff) tier = "EXCEPTIONAL";
    else if (gmv <= lowCutoff) tier = "UNDERPERFORMING";
    else tier = "AVERAGE";
    return { id: p.id, roi, tier };
  });

  const CHUNK = 200;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map((u) =>
        prisma.affiliateProductStat.update({
          where: { id: u.id },
          data: { roi: u.roi, tier: u.tier },
        }),
      ),
    );
  }
}
