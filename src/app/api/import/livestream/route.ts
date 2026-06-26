import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseRM(val: unknown): number {
  if (val === null || val === undefined || val === "") return 0;
  return parseFloat(String(val).replace(/[^0-9.\-]/g, "")) || 0;
}

function parsePct(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  return parseFloat(String(val).replace("%", "")) / 100 || null;
}

function toInt(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = parseInt(String(val));
  return isNaN(n) ? null : n;
}

// "2h05m" | "0h17m" | "13h 30m" → minutes
function parseDuration(val: unknown): number | null {
  const s = String(val || "").trim();
  const m = s.match(/(\d+)h\s*(\d+)m/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

// Extract host name from title using longest-match-first against host list
function extractHost(
  title: string,
  hosts: { id: string; displayName: string }[]
): { id: string; displayName: string } | null {
  const upper = title.toUpperCase();
  // Sort longest display name first to avoid partial matches (AYUNI before AYUNI (A) problem)
  const sorted = [...hosts].sort((a, b) => b.displayName.length - a.displayName.length);
  for (const h of sorted) {
    if (upper.includes(h.displayName.toUpperCase())) return h;
  }
  // Also try splitting on " - " and matching the suffix
  const parts = title.split(" - ");
  if (parts.length >= 2) {
    const suffix = parts[parts.length - 1].trim().toUpperCase();
    for (const h of sorted) {
      if (h.displayName.toUpperCase() === suffix) return h;
    }
  }
  return null;
}

// ── POST /api/import/livestream ───────────────────────────────────────────────
// Body: { action: "preview" | "confirm", brandId, month (YYYY-MM), rows: TikTokRow[] }

export interface TikTokRow {
  roomId: string;
  roomTitle: string;
  startTime: string;
  endTime: string;
  duration: string;
  gmv: string;
  itemsSold: string;
  orders: string;
  skuOrders: string;
  customers: string;
  aov: string;
  views: string;
  impressions: string;
  impressionsPerHour: string;
  gmvPerHour: string;
  showGpm: string;
  watchGpm: string;
  avgViewDurationPerView: string;
  avgViewDuration: string;
  tapThroughRate: string;
  liveCtr: string;
  productImpressions: string;
  productClicks: string;
  ctr: string;
  ctor: string;
  ctorSku: string;
  skuOrderRate: string;
  newFollowers: string;
  followRate: string;
  comments: string;
  commentRate: string;
  shares: string;
  shareRate: string;
  likes: string;
  likeRate: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    action: "preview" | "confirm";
    brandId: string;
    month: string; // "YYYY-MM"
    rows: TikTokRow[];
  };

  const { action, brandId, month, rows } = body;

  if (!brandId || !month || !rows?.length)
    return Response.json({ error: "brandId, month, and rows are required" }, { status: 400 });

  const [year, mon] = month.split("-").map(Number);
  const monthStart = new Date(`${month}-01T00:00:00+08:00`);
  const monthEnd   = new Date(new Date(monthStart).setMonth(monthStart.getMonth() + 1));

  const [hosts, brand, campaigns] = await Promise.all([
    prisma.liveHost.findMany({ select: { id: true, displayName: true } }),
    prisma.brand.findUnique({ where: { id: brandId }, select: { id: true, name: true } }),
    prisma.campaign.findMany({
      where: {
        year,
        month: mon,
        OR: [{ brandId }, { brandId: null }],
        platform: { in: ["TIKTOK", "BOTH"] },
      },
    }),
  ]);

  if (!brand) return Response.json({ error: "Brand not found" }, { status: 404 });

  // ── Build preview rows ────────────────────────────────────────────────────

  const preview = rows.map((r) => {
    const startMYT  = new Date(`${r.startTime.replace(" ", "T")}+08:00`);
    const endMYT    = new Date(`${r.endTime.replace(" ", "T")}+08:00`);
    const host      = extractHost(r.roomTitle, hosts);
    const isCampaign = campaigns.some(
      (c) => startMYT >= new Date(c.startDate) && startMYT <= new Date(c.endDate)
    );
    const campaignName = campaigns.find(
      (c) => startMYT >= new Date(c.startDate) && startMYT <= new Date(c.endDate)
    )?.name ?? null;

    return {
      roomId:       r.roomId,
      roomTitle:    r.roomTitle,
      startMYT:     startMYT.toISOString(),
      endMYT:       endMYT.toISOString(),
      hostId:       host?.id ?? null,
      hostName:     host?.displayName ?? null,
      isCampaign,
      campaignName,
      gmv:          parseRM(r.gmv),
      duration:     parseDuration(r.duration),
      // flag short sessions (< 15 min) as likely tests
      likelyTest:   (parseDuration(r.duration) ?? 0) < 15,
    };
  });

  if (action === "preview") {
    const matched   = preview.filter((r) => r.hostId).length;
    const unmatched = preview.filter((r) => !r.hostId).length;
    const tests     = preview.filter((r) => r.likelyTest).length;
    return Response.json({ preview, matched, unmatched, tests });
  }

  // ── Confirm: delete existing TT- sessions for this brand+month, insert new ─

  // Only delete sessions imported via this new flow (externalRef starts with TT-)
  // Never touches GS- (Google Sheets synced) or manually created sessions
  await prisma.session.deleteMany({
    where: {
      brandId,
      platform: "TIKTOK",
      scheduledStart: { gte: monthStart, lt: monthEnd },
      externalRef: { startsWith: "TT-" },
    },
  });

  // Filter out sessions where host override is null and no match — skip those
  const toInsert = rows
    .map((r, i) => ({ r, p: preview[i] }))
    .filter(({ p }) => p.hostId !== null);

  let inserted = 0;
  let skipped  = 0;

  for (const { r, p } of toInsert) {
    if (p.likelyTest) { skipped++; continue; } // skip sub-15min test sessions

    const startMYT = new Date(`${r.startTime.replace(" ", "T")}+08:00`);
    const endMYT   = new Date(`${r.endTime.replace(" ", "T")}+08:00`);

    await prisma.session.create({
      data: {
        externalRef:          `TT-${r.roomId}`,
        brandId,
        liveHostId:           p.hostId!,
        platform:             "TIKTOK",
        scheduledStart:       startMYT,
        scheduledEnd:         endMYT,
        actualStart:          startMYT,
        actualEnd:            endMYT,
        actualDurationMinutes: p.duration ?? null,
        status:               "COMPLETED",
        isCampaignDay:        p.isCampaign,
        gmv:                  parseRM(r.gmv),
        adsCost:              0, // patched separately by ads cost upload
        itemsSold:            toInt(r.itemsSold),
        ordersPlaced:         toInt(r.orders),
        customers:            toInt(r.customers),
        views:                toInt(r.views),
        productImpressions:   toInt(r.productImpressions),
        productClicks:        toInt(r.productClicks),
        ctr:                  parsePct(r.ctr),
        ctor:                 parsePct(r.ctor),
        newFollowers:         toInt(r.newFollowers),
        comments:             toInt(r.comments),
        shares:               toInt(r.shares),
        likes:                toInt(r.likes),
        avgViewDurationSec:   r.avgViewDuration ? Math.round(parseFloat(r.avgViewDuration)) : null,
      },
    });
    inserted++;
  }

  return Response.json({
    ok: true,
    inserted,
    skipped,
    unmatched: preview.filter((p) => !p.hostId).length,
    month,
    brand: brand.name,
  });
}

// ── PATCH /api/import/livestream ─────────────────────────────────────────────
// Patch adsCost onto existing sessions by Room ID
// Body: { rows: AdsCostRow[] }

export interface AdsCostRow {
  roomId: string;
  cost: string;
  netCost: string;
  grossRevenue: string;
  roi: string;
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { rows: AdsCostRow[] };
  const { rows } = body;

  if (!rows?.length) return Response.json({ error: "rows required" }, { status: 400 });

  let matched = 0, unmatched = 0;

  for (const r of rows) {
    const externalRef = `TT-${r.roomId}`;
    const existing = await prisma.session.findUnique({ where: { externalRef } });
    if (!existing) { unmatched++; continue; }

    await prisma.session.update({
      where: { externalRef },
      data: {
        adsCost:     parseRM(r.cost),
        grossRevenue: parseRM(r.grossRevenue) || null,
      },
    });
    matched++;
  }

  return Response.json({ ok: true, matched, unmatched });
}
