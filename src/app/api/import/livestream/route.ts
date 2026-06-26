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

// "HH:MM:SS" → minutes
function parseHMS(val: unknown): number | null {
  const s = String(val || "").trim();
  const m = s.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

// "HH:MM:SS" → seconds
function parseHMStoSeconds(val: unknown): number | null {
  const s = String(val || "").trim();
  const m = s.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]);
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

// ── Row types ─────────────────────────────────────────────────────────────────

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

export interface ShopeeRow {
  no: string;          // row number from export
  title: string;       // Livestream Name
  startTime: string;   // "DD-MM-YYYY HH:MM"
  duration: string;    // "HH:MM:SS"
  engagedViewers: string;
  comments: string;
  atc: string;
  avgViewDuration: string; // "HH:MM:SS"
  viewers: string;
  ordersPlaced: string;
  ordersConfirmed: string;
  itemsSoldPlaced: string;
  itemsSoldConfirmed: string;
  salesPlaced: string;
  salesConfirmed: string;  // GMV — Sales(Confirmed Order)
}

// ── POST /api/import/livestream ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    action: "preview" | "confirm";
    platform: "TIKTOK" | "SHOPEE";
    brandId: string;
    month: string; // "YYYY-MM"
    rows: TikTokRow[] | ShopeeRow[];
    hostOverrides?: Record<string, string>; // roomId/key → hostId
  };

  const { action, platform, brandId, month, rows, hostOverrides = {} } = body;

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
        platform: { in: [platform, "BOTH"] },
      },
    }),
  ]);

  if (!brand) return Response.json({ error: "Brand not found" }, { status: 404 });

  // ── Build preview rows ────────────────────────────────────────────────────

  const preview = (platform === "TIKTOK"
    ? buildTikTokPreview(rows as TikTokRow[], hosts, campaigns, hostOverrides)
    : buildShopeePreview(rows as ShopeeRow[], hosts, campaigns, hostOverrides)
  );

  if (action === "preview") {
    const matched   = preview.filter((r) => r.hostId).length;
    const unmatched = preview.filter((r) => !r.hostId).length;
    const tests     = preview.filter((r) => r.likelyTest).length;
    return Response.json({ preview, matched, unmatched, tests });
  }

  // ── Confirm: delete existing sessions for this brand+month+platform ────────

  const prefix = platform === "TIKTOK" ? "TT-" : "SP-";
  await prisma.session.deleteMany({
    where: {
      brandId,
      platform,
      scheduledStart: { gte: monthStart, lt: monthEnd },
      externalRef: { startsWith: prefix },
    },
  });

  let inserted = 0;
  let skipped  = 0;

  for (const p of preview) {
    if (!p.hostId) { skipped++; continue; }
    if (p.likelyTest) { skipped++; continue; }

    await prisma.session.create({
      data: { ...p.insertData, brandId, liveHostId: p.hostId },
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

// ── TikTok preview builder ────────────────────────────────────────────────────

function buildTikTokPreview(
  rows: TikTokRow[],
  hosts: { id: string; displayName: string }[],
  campaigns: { startDate: Date | string; endDate: Date | string; name: string }[],
  hostOverrides: Record<string, string>
) {
  return rows.map((r) => {
    const startMYT  = new Date(`${r.startTime.replace(" ", "T")}+08:00`);
    const endMYT    = new Date(`${r.endTime.replace(" ", "T")}+08:00`);
    const exactMinutes = Math.round((endMYT.getTime() - startMYT.getTime()) / 60_000);
    const key = r.roomId;
    const overrideHostId = hostOverrides[key];
    const host = overrideHostId
      ? hosts.find(h => h.id === overrideHostId) ?? null
      : extractHost(r.roomTitle, hosts);
    const isCampaign = campaigns.some(
      (c) => startMYT >= new Date(c.startDate) && startMYT <= new Date(c.endDate)
    );
    const campaignName = campaigns.find(
      (c) => startMYT >= new Date(c.startDate) && startMYT <= new Date(c.endDate)
    )?.name ?? null;

    return {
      key,
      roomTitle:    r.roomTitle,
      startMYT:     startMYT.toISOString(),
      endMYT:       endMYT.toISOString(),
      hostId:       host?.id ?? null,
      hostName:     host?.displayName ?? null,
      isCampaign,
      campaignName,
      gmv:          parseRM(r.gmv),
      duration:     exactMinutes,
      likelyTest:   exactMinutes < 15,
      insertData: {
        externalRef:          `TT-${r.roomId}`,
        brandId:              "", // filled below
        liveHostId:           host?.id ?? "",
        platform:             "TIKTOK" as const,
        title:                r.roomTitle,
        scheduledStart:       startMYT,
        scheduledEnd:         endMYT,
        actualStart:          startMYT,
        actualEnd:            endMYT,
        actualDurationMinutes: exactMinutes,
        status:               "COMPLETED" as const,
        isCampaignDay:        isCampaign,
        gmv:                  parseRM(r.gmv),
        adsCost:              0,
        itemsSold:            toInt(r.itemsSold),
        ordersPlaced:         toInt(r.orders),
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
    };
  });
}

// ── Shopee preview builder ────────────────────────────────────────────────────

// Parse "DD-MM-YYYY HH:MM" in MYT
function parseShopeeDate(val: string): Date {
  const [datePart, timePart] = val.trim().split(" ");
  const [dd, mm, yyyy] = datePart.split("-");
  return new Date(`${yyyy}-${mm}-${dd}T${timePart}:00+08:00`);
}

function buildShopeePreview(
  rows: ShopeeRow[],
  hosts: { id: string; displayName: string }[],
  campaigns: { startDate: Date | string; endDate: Date | string; name: string }[],
  hostOverrides: Record<string, string>
) {
  return rows.map((r) => {
    const startMYT     = parseShopeeDate(r.startTime);
    const durationMins = parseHMS(r.duration) ?? 0;
    const endMYT       = new Date(startMYT.getTime() + durationMins * 60_000);
    // Stable key: row number + start datetime
    const key = `SP-${r.no}-${r.startTime.replace(/[^0-9]/g, "")}`;
    const overrideHostId = hostOverrides[key];
    const host = overrideHostId
      ? hosts.find(h => h.id === overrideHostId) ?? null
      : extractHost(r.title, hosts);
    const isCampaign = campaigns.some(
      (c) => startMYT >= new Date(c.startDate) && startMYT <= new Date(c.endDate)
    );
    const campaignName = campaigns.find(
      (c) => startMYT >= new Date(c.startDate) && startMYT <= new Date(c.endDate)
    )?.name ?? null;

    return {
      key,
      roomTitle:    r.title,
      startMYT:     startMYT.toISOString(),
      endMYT:       endMYT.toISOString(),
      hostId:       host?.id ?? null,
      hostName:     host?.displayName ?? null,
      isCampaign,
      campaignName,
      gmv:          parseRM(r.salesConfirmed),
      duration:     durationMins,
      likelyTest:   durationMins < 15,
      insertData: {
        externalRef:          key,
        brandId:              "", // filled below
        liveHostId:           host?.id ?? "",
        platform:             "SHOPEE" as const,
        title:                r.title,
        scheduledStart:       startMYT,
        scheduledEnd:         endMYT,
        actualStart:          startMYT,
        actualEnd:            endMYT,
        actualDurationMinutes: durationMins,
        status:               "COMPLETED" as const,
        isCampaignDay:        isCampaign,
        gmv:                  parseRM(r.salesConfirmed),
        adsCost:              0,
        itemsSold:            toInt(r.itemsSoldConfirmed),
        itemsSoldPlaced:      toInt(r.itemsSoldPlaced),
        ordersPlaced:         toInt(r.ordersPlaced),
        ordersConfirmed:      toInt(r.ordersConfirmed),
        salesPlaced:          parseRM(r.salesPlaced),
        viewers:              toInt(r.viewers),
        engagedViewers:       toInt(r.engagedViewers),
        addToCart:            toInt(r.atc),
        comments:             toInt(r.comments),
        avgViewDurationSec:   parseHMStoSeconds(r.avgViewDuration),
      },
    };
  });
}

// ── PATCH /api/import/livestream ─────────────────────────────────────────────
// Patch adsCost onto existing TikTok sessions by Room ID
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
