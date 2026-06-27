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
  // Strip thousands-separator commas (e.g. "4,413" → "4413") before parsing
  const n = parseInt(String(val).replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

// Parse duration string → minutes.
// Handles: "HH:MM:SS", "1h00m", "1h 30m", "90m", "1:30:00"
function parseHMS(val: unknown): number | null {
  const s = String(val || "").trim();
  // "HH:MM:SS" or "H:MM:SS"
  const hms = s.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (hms) return parseInt(hms[1]) * 60 + parseInt(hms[2]);
  // "1h30m", "1h 30m", "1h00m" (TikTok MY format)
  const hm = s.match(/(\d+)\s*h\s*(\d+)\s*m/i);
  if (hm) return parseInt(hm[1]) * 60 + parseInt(hm[2]);
  // "90m" (minutes only)
  const mo = s.match(/^(\d+)\s*m$/i);
  if (mo) return parseInt(mo[1]);
  return null;
}

// "HH:MM:SS" → seconds
function parseHMStoSeconds(val: unknown): number | null {
  const s = String(val || "").trim();
  const m = s.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]);
}

// Normalize a display name for loose matching: remove parentheses and collapse spaces
// e.g. "WANI (A)" → "WANI A", "AYUNI (B)" → "AYUNI B"
function normalizeHostName(name: string): string {
  return name.replace(/[()]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

// Extract host name from title using longest-match-first against host list.
// Exact and normalized (parentheses-stripped) checks run in a single pass sorted
// by the longer of the two lengths — so "WANI (A)" (norm "WANI A", len 7) is
// evaluated before plain "WANI" (len 4), preventing the short name from stealing
// a title that belongs to the suffixed host.
function extractHost(
  title: string,
  hosts: { id: string; displayName: string }[]
): { id: string; displayName: string } | null {
  const upper = title.toUpperCase();

  // Sort by the longer of displayName or normalizedName length, descending
  const sorted = [...hosts].sort((a, b) => {
    const aLen = Math.max(a.displayName.length, normalizeHostName(a.displayName).length);
    const bLen = Math.max(b.displayName.length, normalizeHostName(b.displayName).length);
    return bLen - aLen;
  });

  // Single pass: try exact match first, then normalized match
  for (const h of sorted) {
    if (upper.includes(h.displayName.toUpperCase())) return h;
    const norm = normalizeHostName(h.displayName);
    if (norm && upper.includes(norm)) return h;
  }

  // Suffix fallback: last segment after " - " (exact then normalized)
  const parts = title.split(" - ");
  if (parts.length >= 2) {
    const suffix = parts[parts.length - 1].trim().toUpperCase();
    for (const h of sorted) {
      if (h.displayName.toUpperCase() === suffix) return h;
      if (normalizeHostName(h.displayName) === suffix) return h;
    }
  }

  return null;
}

// Punctuality: same rule as sync/sheets
function computePunctuality(actualStart: Date, scheduledStart: Date, earlyThresholdMinutes = 5): string {
  const diffMin = (actualStart.getTime() - scheduledStart.getTime()) / 60_000;
  if (diffMin < -earlyThresholdMinutes) return "EARLY";
  if (diffMin <= 5) return "ON_TIME";
  return "LATE";
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
  no: string;
  title: string;
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
  salesConfirmed: string;
}

// ── Shopee admin session type ─────────────────────────────────────────────────

interface AdminSession {
  id: string;
  externalRef: string | null;
  scheduledStart: Date;
  scheduledEnd: Date;
  liveHostId: string | null;
}

// Find the best matching admin session for an actual start time + host
// Returns null if no session within ±2 hours with same host
function findMatchingAdminSession(
  actualStart: Date,
  hostId: string,
  adminSessions: AdminSession[]
): AdminSession | null {
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  const candidates = adminSessions.filter(s =>
    s.liveHostId === hostId &&
    Math.abs(actualStart.getTime() - s.scheduledStart.getTime()) <= TWO_HOURS_MS
  );
  if (candidates.length === 0) return null;
  // Pick closest scheduled start
  return candidates.sort((a, b) =>
    Math.abs(actualStart.getTime() - a.scheduledStart.getTime()) -
    Math.abs(actualStart.getTime() - b.scheduledStart.getTime())
  )[0];
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
    month: string;
    rows: TikTokRow[] | ShopeeRow[];
    hostOverrides?: Record<string, string>;
    campaignOverrides?: Record<string, boolean>; // key → isCampaignDay override
  };

  const { action, platform, brandId, month, rows, hostOverrides = {}, campaignOverrides = {} } = body;

  if (!brandId || !month || !rows?.length)
    return Response.json({ error: "brandId, month, and rows are required" }, { status: 400 });

  const [year, mon] = month.split("-").map(Number);
  const monthStart = new Date(`${month}-01T00:00:00+08:00`);
  const monthEnd   = new Date(new Date(monthStart).setMonth(monthStart.getMonth() + 1));

  const [hosts, brand, campaigns] = await Promise.all([
    prisma.liveHost.findMany({ select: { id: true, displayName: true } }),
    prisma.brand.findUnique({ where: { id: brandId }, select: { id: true, name: true } }),
    // Query by date overlap so multi-month campaigns and cross-month dates are detected
    prisma.campaign.findMany({
      where: {
        startDate: { lt: monthEnd },
        endDate:   { gte: monthStart },
        OR: [{ brandId }, { brandId: null }],
        platform: { in: [platform, "BOTH"] },
      },
    }),
  ]);

  if (!brand) return Response.json({ error: "Brand not found" }, { status: 404 });

  // Fetch admin-created sessions for matching (non-TT-/SP- prefix = manually created)
  const adminPrefix = platform === "TIKTOK" ? "TT-" : "SP-";
  const adminSessions: AdminSession[] = await prisma.session.findMany({
    where: {
      brandId,
      platform,
      scheduledStart: { gte: monthStart, lt: monthEnd },
      OR: [
        { externalRef: null },
        { externalRef: { not: { startsWith: adminPrefix } } },
      ],
    },
    select: { id: true, externalRef: true, scheduledStart: true, scheduledEnd: true, liveHostId: true },
  });

  // ── Build preview rows ────────────────────────────────────────────────────

  const preview = platform === "TIKTOK"
    ? buildTikTokPreview(rows as TikTokRow[], hosts, campaigns, hostOverrides, campaignOverrides, adminSessions)
    : buildShopeePreview(rows as ShopeeRow[], hosts, campaigns, hostOverrides, adminSessions, campaignOverrides);

  if (action === "preview") {
    const matched   = preview.filter((r) => r.hostId).length;
    const unmatched = preview.filter((r) => !r.hostId).length;
    const tests     = preview.filter((r) => r.likelyTest).length;
    return Response.json({ preview, matched, unmatched, tests });
  }

  // ── Confirm ───────────────────────────────────────────────────────────────

  if (platform === "TIKTOK") {
    // Delete old TT- sessions from previous imports (never touch admin-created sessions)
    await prisma.session.deleteMany({
      where: {
        brandId, platform: "TIKTOK",
        scheduledStart: { gte: monthStart, lt: monthEnd },
        externalRef: { startsWith: "TT-" },
      },
    });

    const activeRows = preview.filter(p => p.hostId && !p.likelyTest);
    const groupedBySlot = new Map<string, typeof activeRows>();
    const unslottedRows: typeof activeRows = [];

    for (const p of activeRows) {
      if (p.matchedSlotId) {
        const group = groupedBySlot.get(p.matchedSlotId) ?? [];
        group.push(p);
        groupedBySlot.set(p.matchedSlotId, group);
      } else {
        unslottedRows.push(p);
      }
    }

    let updated = 0, inserted = 0;

    for (const [slotId, group] of groupedBySlot) {
      const adminSlot = adminSessions.find(s => s.id === slotId)!;
      const merged = mergeTikTokRows(group, adminSlot);
      await prisma.session.update({ where: { id: slotId }, data: merged });
      updated++;
    }

    for (const p of unslottedRows) {
      await prisma.session.create({ data: { ...p.insertData, brandId, liveHostId: p.hostId! } });
      inserted++;
    }

    const skipped = preview.filter(p => !p.hostId || p.likelyTest).length;
    return Response.json({ ok: true, updated, inserted, skipped, unmatched: preview.filter(p => !p.hostId).length, month, brand: brand.name });
  }

  // ── Shopee confirm: match-and-merge ───────────────────────────────────────

  // 1. Delete old SP- sessions from previous imports (not admin-created ones)
  await prisma.session.deleteMany({
    where: {
      brandId, platform: "SHOPEE",
      scheduledStart: { gte: monthStart, lt: monthEnd },
      externalRef: { startsWith: "SP-" },
    },
  });

  // 2. Filter out test sessions and unmatched hosts
  const activeRows = preview.filter(p => p.hostId && !p.likelyTest);

  // 3. Group rows by matched admin session ID
  const groupedBySlot = new Map<string, typeof activeRows>();
  const unslottedRows: typeof activeRows = [];

  for (const p of activeRows) {
    if (p.matchedSlotId) {
      const group = groupedBySlot.get(p.matchedSlotId) ?? [];
      group.push(p);
      groupedBySlot.set(p.matchedSlotId, group);
    } else {
      unslottedRows.push(p);
    }
  }

  let updated = 0, inserted = 0, skipped = 0;

  // 4. Update matched admin sessions with merged data
  for (const [slotId, group] of groupedBySlot) {
    const adminSlot = adminSessions.find(s => s.id === slotId)!;
    const merged = mergeShopeeRows(group, adminSlot);
    await prisma.session.update({
      where: { id: slotId },
      data: merged,
    });
    updated++;
  }

  // 5. Create new SP- sessions for rows with no matching admin slot
  for (const p of unslottedRows) {
    await prisma.session.create({ data: { ...p.insertData, brandId, liveHostId: p.hostId! } });
    inserted++;
  }

  skipped = preview.filter(p => !p.hostId || p.likelyTest).length;

  return Response.json({
    ok: true,
    updated,
    inserted,
    skipped,
    unmatched: preview.filter(p => !p.hostId).length,
    month,
    brand: brand.name,
  });
}

// ── Merge multiple Shopee rows into one session update ────────────────────────

function mergeShopeeRows(
  rows: Array<{ startMYT: string; endMYT: string; duration: number | null; gmv: number; isCampaign: boolean; insertData: Record<string, unknown> }>,
  adminSlot: AdminSession
) {
  const sorted = [...rows].sort((a, b) => new Date(a.startMYT).getTime() - new Date(b.startMYT).getTime());
  const earliest = sorted[0];
  const latest   = sorted[sorted.length - 1];

  const totalDuration  = rows.reduce((s, r) => s + (r.duration ?? 0), 0);
  const totalGmv       = rows.reduce((s, r) => s + r.gmv, 0);
  const sumOrders      = rows.reduce((s, r) => s + ((r.insertData.ordersConfirmed as number) ?? 0), 0);
  const sumOrdersP     = rows.reduce((s, r) => s + ((r.insertData.ordersPlaced as number) ?? 0), 0);
  const sumItems       = rows.reduce((s, r) => s + ((r.insertData.itemsSold as number) ?? 0), 0);
  const sumItemsP      = rows.reduce((s, r) => s + ((r.insertData.itemsSoldPlaced as number) ?? 0), 0);
  const sumSalesP      = rows.reduce((s, r) => s + ((r.insertData.salesPlaced as number) ?? 0), 0);
  const sumComments    = rows.reduce((s, r) => s + ((r.insertData.comments as number) ?? 0), 0);
  const sumAtc         = rows.reduce((s, r) => s + ((r.insertData.addToCart as number) ?? 0), 0);
  // Viewers: max across rows (same audience, avoid double-counting)
  const maxViewers     = Math.max(...rows.map(r => (r.insertData.viewers as number) ?? 0)) || null;
  const maxEngaged     = Math.max(...rows.map(r => (r.insertData.engagedViewers as number) ?? 0)) || null;
  // Avg view duration: from longest session
  const longestRow     = [...rows].sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))[0];

  const actualStart = new Date(earliest.startMYT);
  const actualEnd   = new Date(latest.endMYT);
  const punctuality = computePunctuality(actualStart, adminSlot.scheduledStart);

  return {
    title:                (earliest.insertData.title as string) ?? null,
    status:               "COMPLETED" as const,
    actualStart,
    actualEnd,
    actualDurationMinutes: totalDuration,
    isCampaignDay:        rows.some(r => r.isCampaign),
    punctuality,
    gmv:                  totalGmv,
    adsCost:              0,
    ordersConfirmed:      sumOrders || null,
    ordersPlaced:         sumOrdersP || null,
    itemsSold:            sumItems || null,
    itemsSoldPlaced:      sumItemsP || null,
    salesPlaced:          sumSalesP || null,
    viewers:              maxViewers,
    engagedViewers:       maxEngaged,
    addToCart:            sumAtc || null,
    comments:             sumComments || null,
    avgViewDurationSec:   longestRow.insertData.avgViewDurationSec as number | null,
  };
}

// ── Merge TikTok rows for same slot (usually just one row per slot) ───────────

function mergeTikTokRows(
  rows: Array<{ startMYT: string; endMYT: string; duration: number | null; gmv: number; isCampaign: boolean; insertData: Record<string, unknown> }>,
  adminSlot: AdminSession
) {
  const sorted = [...rows].sort((a, b) => new Date(a.startMYT).getTime() - new Date(b.startMYT).getTime());
  const earliest = sorted[0];
  const latest   = sorted[sorted.length - 1];
  const totalDuration = rows.reduce((s, r) => s + (r.duration ?? 0), 0);
  const totalGmv      = rows.reduce((s, r) => s + r.gmv, 0);
  const actualStart   = new Date(earliest.startMYT);
  const actualEnd     = new Date(latest.endMYT);
  const punctuality   = computePunctuality(actualStart, adminSlot.scheduledStart);
  const d = earliest.insertData;

  return {
    title:                (d.title as string) ?? null,
    status:               "COMPLETED" as const,
    actualStart,
    actualEnd,
    actualDurationMinutes: totalDuration,
    isCampaignDay:        rows.some(r => r.isCampaign),
    punctuality,
    gmv:                  totalGmv,
    adsCost:              (d.adsCost as number) ?? 0,
    itemsSold:            (d.itemsSold as number | null) ?? null,
    ordersPlaced:         (d.ordersPlaced as number | null) ?? null,
    views:                (d.views as number | null) ?? null,
    productImpressions:   (d.productImpressions as number | null) ?? null,
    productClicks:        (d.productClicks as number | null) ?? null,
    ctr:                  (d.ctr as number | null) ?? null,
    ctor:                 (d.ctor as number | null) ?? null,
    newFollowers:         (d.newFollowers as number | null) ?? null,
    comments:             (d.comments as number | null) ?? null,
    shares:               (d.shares as number | null) ?? null,
    likes:                (d.likes as number | null) ?? null,
    avgViewDurationSec:   (d.avgViewDurationSec as number | null) ?? null,
  };
}

// ── TikTok preview builder ────────────────────────────────────────────────────

function buildTikTokPreview(
  rows: TikTokRow[],
  hosts: { id: string; displayName: string }[],
  campaigns: { startDate: Date | string; endDate: Date | string; name: string }[],
  hostOverrides: Record<string, string>,
  campaignOverrides: Record<string, boolean>,
  adminSessions: AdminSession[]
) {
  return rows.map((r) => {
    const startMYT  = new Date(`${r.startTime.replace(" ", "T")}+08:00`);
    const endMYT    = new Date(`${r.endTime.replace(" ", "T")}+08:00`);
    // Prefer TikTok's own duration column (HH:MM:SS) — more accurate than end-start
    // which can differ due to stream pauses or TikTok reporting lag.
    // Fall back to computed gap only if duration column is absent/unparseable.
    const durationFromCol = parseHMS(r.duration);
    const exactMinutes = durationFromCol ?? Math.round((endMYT.getTime() - startMYT.getTime()) / 60_000);
    const key = r.roomId;
    const overrideHostId = hostOverrides[key];
    const host = overrideHostId
      ? hosts.find(h => h.id === overrideHostId) ?? null
      : extractHost(r.roomTitle, hosts);
    const autoIsCampaign = campaigns.some(c => startMYT >= new Date(c.startDate) && startMYT <= new Date(c.endDate));
    const isCampaign = key in campaignOverrides ? campaignOverrides[key] : autoIsCampaign;
    const campaignName = campaigns.find(c => startMYT >= new Date(c.startDate) && startMYT <= new Date(c.endDate))?.name ?? null;
    const matchedSlot = host ? findMatchingAdminSession(startMYT, host.id, adminSessions) : null;

    return {
      key,
      roomTitle:      r.roomTitle,
      startMYT:       startMYT.toISOString(),
      endMYT:         endMYT.toISOString(),
      hostId:         host?.id ?? null,
      hostName:       host?.displayName ?? null,
      isCampaign,
      campaignName,
      gmv:            parseRM(r.gmv),
      duration:       exactMinutes,
      likelyTest:     exactMinutes < 15,
      matchedSlotId:  matchedSlot?.id ?? null,
      matchedSlotTime: matchedSlot?.scheduledStart.toISOString() ?? null,
      insertData: {
        externalRef:          `TT-${r.roomId}`,
        brandId:              "",
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

function parseShopeeDate(val: string): Date {
  const [datePart, timePart] = val.trim().split(" ");
  const [dd, mm, yyyy] = datePart.split("-");
  return new Date(`${yyyy}-${mm}-${dd}T${timePart}:00+08:00`);
}

function buildShopeePreview(
  rows: ShopeeRow[],
  hosts: { id: string; displayName: string }[],
  campaigns: { startDate: Date | string; endDate: Date | string; name: string }[],
  hostOverrides: Record<string, string>,
  adminSessions: AdminSession[],
  campaignOverrides: Record<string, boolean>
) {
  return rows.map((r) => {
    const startMYT     = parseShopeeDate(r.startTime);
    const durationMins = parseHMS(r.duration) ?? 0;
    const endMYT       = new Date(startMYT.getTime() + durationMins * 60_000);
    const key = `SP-${r.no}-${r.startTime.replace(/[^0-9]/g, "")}`;
    const overrideHostId = hostOverrides[key];
    const host = overrideHostId
      ? hosts.find(h => h.id === overrideHostId) ?? null
      : extractHost(r.title, hosts);
    const autoIsCampaign = campaigns.some(c => startMYT >= new Date(c.startDate) && startMYT <= new Date(c.endDate));
    const isCampaign = key in campaignOverrides ? campaignOverrides[key] : autoIsCampaign;
    const campaignName = campaigns.find(c => startMYT >= new Date(c.startDate) && startMYT <= new Date(c.endDate))?.name ?? null;

    // Match to admin slot if host identified
    const matchedSlot = host ? findMatchingAdminSession(startMYT, host.id, adminSessions) : null;

    return {
      key,
      roomTitle:       r.title,
      startMYT:        startMYT.toISOString(),
      endMYT:          endMYT.toISOString(),
      hostId:          host?.id ?? null,
      hostName:        host?.displayName ?? null,
      isCampaign,
      campaignName,
      gmv:             parseRM(r.salesConfirmed),
      duration:        durationMins,
      likelyTest:      durationMins < 15,
      matchedSlotId:   matchedSlot?.id ?? null,
      matchedSlotTime: matchedSlot?.scheduledStart.toISOString() ?? null,
      insertData: {
        externalRef:          key,
        brandId:              "",
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
        adsCost:      parseRM(r.cost),
        grossRevenue: parseRM(r.grossRevenue) || null,
      },
    });
    matched++;
  }

  return Response.json({ ok: true, matched, unmatched });
}
