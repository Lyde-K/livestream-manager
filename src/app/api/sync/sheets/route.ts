import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

interface SheetRow {
  platform: string;
  title?: string;
  startTime: string; // "2026-03-31 20:00" or "26-03-2026 21:57"
  durationSec?: number | null;
  hours?: number | null;       // manually entered hours — takes precedence over durationSec
  // TikTok metrics
  gmv?: number | null;
  grossRevenue?: number | null;
  adsCost?: number | null;
  views?: number | null;
  viewers?: number | null;
  peakViewers?: number | null;
  productClicks?: number | null;
  productImpressions?: number | null;
  ctr?: number | null;
  ctor?: number | null;
  gmv1kViews?: number | null;  // GMV/1K views = GPM (TikTok export col P)
  likes?: number | null;
  shares?: number | null;
  comments?: number | null;
  newFollowers?: number | null;
  avgViewDuration?: string | null;
  // Shopee metrics
  addToCart?: number | null;
  ordersPlaced?: number | null;
  ordersConfirmed?: number | null;
  itemsSold?: number | null;
  itemsSoldPlaced?: number | null;
  salesPlaced?: number | null;
  engagedViewers?: number | null;
  // match fields (manual columns)
  host: string;
  brand: string;
  campaign?: boolean | null;
  notes?: string | null;
}

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/**
 * Parse a datetime string from the GAS sync script.
 *
 * All times in the Google Sheet are in Malaysia time (MYT = UTC+8).
 * We MUST append "+08:00" so JavaScript doesn't silently treat the
 * bare datetime as UTC (which would shift every time by -8 hours).
 *
 * Supported formats (both TikTok and Shopee columns):
 *   "18-04-2026 11:04"  — DD-MM-YYYY HH:mm  (raw string from platform export)
 *   "2026-04-18 11:04"  — YYYY-MM-DD HH:mm  (GAS Utilities.formatDate output)
 *   ISO with offset e.g. "2026-04-18T11:04:00+08:00" — passed through as-is
 */
function parseDT(s: string): Date | null {
  if (!s) return null;
  const raw = s.trim();

  // Already has timezone offset — trust it as-is
  if (/[+-]\d{2}:?\d{2}$/.test(raw) || raw.endsWith("Z")) {
    return new Date(raw);
  }

  // "2026-04-18 11:04" or "2026-04-18T11:04" — YYYY-MM-DD (from GAS formatDate, SGT time)
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw)) {
    return new Date(raw.slice(0, 16).replace(" ", "T") + ":00+08:00");
  }

  // "18-04-2026 11:04" — DD-MM-YYYY HH:mm (raw string from TikTok/Shopee export, SGT time)
  const m = raw.match(/^(\d{2})-(\d{2})-(\d{4}) (\d{2}:\d{2})/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:00+08:00`);

  // Fallback — let JS parse, but this may be UTC-shifted
  return new Date(raw);
}

function computePunctuality(
  actualStart: Date,
  scheduledStart: Date,
  earlyThresholdMinutes: number
): string {
  const diffMin = (actualStart.getTime() - scheduledStart.getTime()) / 60000;
  if (diffMin < -earlyThresholdMinutes) return "EARLY";
  if (diffMin <= 5) return "ON_TIME";
  return "LATE";
}

export async function POST(req: NextRequest) {
  try {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.SHEETS_SYNC_KEY)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { rows?: SheetRow[] };
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const rows: SheetRow[] = body.rows ?? [];
  if (!Array.isArray(rows) || rows.length === 0)
    return Response.json({ error: "No rows provided" }, { status: 400 });

  const [allHosts, allBrands, defaultRoom, commissionRule] = await Promise.all([
    prisma.liveHost.findMany({ where: { isActive: true } }),
    prisma.brand.findMany(),
    prisma.room.findFirst(),
    prisma.commissionRule.findFirst({ orderBy: { isDefault: "desc" } }),
  ]);

  const earlyThresholdMinutes = commissionRule?.earlyThresholdMinutes ?? 5;

  // ── Pre-load all PENDING sessions that could match any row in this batch ──
  // Parse all valid start times first to determine the date window
  const parsedTimes = rows
    .map(r => parseDT(r.startTime))
    .filter((d): d is Date => d !== null && !isNaN(d.getTime()));

  let pendingSessions: { id: string; liveHostId: string; brandId: string; scheduledStart: Date }[] = [];
  if (parsedTimes.length > 0) {
    const minTime = new Date(Math.min(...parsedTimes.map(d => d.getTime())) - 90 * 60 * 1000);
    const maxTime = new Date(Math.max(...parsedTimes.map(d => d.getTime())) + 90 * 60 * 1000);
    pendingSessions = await prisma.session.findMany({
      where: { status: "PENDING", scheduledStart: { gte: minTime, lte: maxTime } },
      select: { id: true, liveHostId: true, brandId: true, scheduledStart: true },
    });
  }

  const results = { upserted: 0, skipped: 0, errors: [] as string[] };

  // Collect sync log errors to batch-insert at the end
  const syncLogErrors: Parameters<typeof prisma.syncLog.create>[0]["data"][] = [];

  for (const row of rows) {
    try {
      if (!row.host || !row.brand || !row.startTime) { results.skipped++; continue; }

      const platform = (row.platform || "TIKTOK").trim().toUpperCase().includes("SHOPEE") ? "SHOPEE" : "TIKTOK";

      const host  = allHosts.find(h => h.displayName.trim().toUpperCase() === row.host.trim().toUpperCase());
      const brand = allBrands.find(b => b.name.trim().toUpperCase() === row.brand.trim().toUpperCase());

      // Log any unmatched host / brand to SyncLog for the admin to review
      if (!host || !brand) {
        const errorType = !host && !brand ? "BOTH_NOT_FOUND" : !host ? "HOST_NOT_FOUND" : "BRAND_NOT_FOUND";
        const message = [
          !host  ? `Host "${row.host}" not found`  : null,
          !brand ? `Brand "${row.brand}" not found` : null,
        ].filter(Boolean).join(" · ");
        syncLogErrors.push({ platform, rawHost: row.host, rawBrand: row.brand, startTime: row.startTime, errorType, message });
        results.errors.push(message);
        results.skipped++;
        continue;
      }

      const actualStart = parseDT(row.startTime);
      if (!actualStart || isNaN(actualStart.getTime())) {
        syncLogErrors.push({ platform, rawHost: row.host, rawBrand: row.brand, startTime: row.startTime, errorType: "INVALID_DATE", message: `Cannot parse date: "${row.startTime}"` });
        results.errors.push(`Bad startTime: "${row.startTime}"`); results.skipped++; continue;
      }

      // Hours (manual) takes precedence over export duration seconds
      const actualDurationMinutes = row.hours
        ? Math.round(row.hours * 60)
        : row.durationSec ? Math.round(row.durationSec / 60) : null;

      const durationMs = actualDurationMinutes
        ? actualDurationMinutes * 60 * 1000
        : row.durationSec ? row.durationSec * 1000 : 2 * 3600 * 1000;

      const dateStr  = actualStart.toISOString().slice(0, 10);
      const startStr = actualStart.toISOString().slice(11, 16);
      const externalRef = `GS-${platform}-${dateStr}-${host.displayName}-${brand.name}-${startStr}`;

      // ── Punctuality: match in-memory using pre-loaded PENDING sessions ──────
      let punctuality: string | null = null;
      const windowStart = actualStart.getTime() - 90 * 60 * 1000;
      const windowEnd   = actualStart.getTime() + 90 * 60 * 1000;
      const candidates = pendingSessions.filter(s =>
        s.liveHostId === host.id &&
        s.brandId === brand.id &&
        s.scheduledStart.getTime() >= windowStart &&
        s.scheduledStart.getTime() <= windowEnd
      );
      if (candidates.length > 0) {
        const closest = candidates.reduce((best, s) =>
          Math.abs(s.scheduledStart.getTime() - actualStart.getTime()) <
          Math.abs(best.scheduledStart.getTime() - actualStart.getTime()) ? s : best
        );
        punctuality = computePunctuality(actualStart, closest.scheduledStart, earlyThresholdMinutes);
      }

      // ── avg view duration: "HH:MM:SS" or "MM:SS" → seconds ─────────────────
      let avgViewDurationSec: number | null = null;
      if (row.avgViewDuration) {
        const parts = String(row.avgViewDuration).split(":").map(Number);
        if (parts.length === 3) avgViewDurationSec = parts[0]*3600 + parts[1]*60 + parts[2];
        else if (parts.length === 2) avgViewDurationSec = parts[0]*60 + parts[1];
        else avgViewDurationSec = Number(row.avgViewDuration) || null;
      }

      const scheduledEnd = new Date(actualStart.getTime() + durationMs);

      const metrics = {
        gmv:                num(row.gmv),
        grossRevenue:       num(row.grossRevenue),
        adsCost:            num(row.adsCost),
        views:              num(row.views),
        viewers:            num(row.viewers),
        peakViewers:        num(row.peakViewers),
        productClicks:      num(row.productClicks),
        productImpressions: num(row.productImpressions),
        ctr:                num(row.ctr),
        ctor:               num(row.ctor),
        addToCart:          num(row.addToCart),
        ordersPlaced:       num(row.ordersPlaced),
        ordersConfirmed:    num(row.ordersConfirmed),
        itemsSold:          num(row.itemsSold),
        itemsSoldPlaced:    num(row.itemsSoldPlaced),
        salesPlaced:        num(row.salesPlaced),
        likes:              num(row.likes),
        shares:             num(row.shares),
        comments:           num(row.comments),
        newFollowers:       num(row.newFollowers),
        avgViewDurationSec,
        engagedViewers:     num(row.engagedViewers),
        actualDurationMinutes,
        actualStart,
        actualEnd:          scheduledEnd,
        isCampaignDay:      row.campaign ?? false,
        punctuality,
        notes:              row.notes || null,
      };

      await prisma.session.upsert({
        where: { externalRef },
        update: {
          liveHostId: host.id, brandId: brand.id,
          platform, scheduledStart: actualStart, scheduledEnd,
          status: "COMPLETED", ...metrics,
        },
        create: {
          externalRef,
          roomId: defaultRoom?.id ?? "",
          liveHostId: host.id,
          brandId: brand.id,
          platform,
          scheduledStart: actualStart,
          scheduledEnd,
          status: "COMPLETED",
          ...metrics,
        },
      });

      results.upserted++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.errors.push(msg);
      results.skipped++;
    }
  }

  // Batch-insert all sync log errors in one query
  if (syncLogErrors.length > 0) {
    await prisma.syncLog.createMany({ data: syncLogErrors, skipDuplicates: true });
  }

  return Response.json({
    ok: true,
    upserted: results.upserted,
    skipped: results.skipped,
    errors: results.errors.slice(0, 20),
  });

  } catch (err) {
    // Safety net — ensure we always return JSON so GAS can parse it
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync/sheets] Uncaught error:", message);
    return Response.json({ error: "Internal server error", detail: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.SHEETS_SYNC_KEY)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const hosts = await prisma.liveHost.findMany({
    where: { isActive: true },
    select: { displayName: true, type: true },
    orderBy: { displayName: "asc" },
  });
  const brands = await prisma.brand.findMany({
    select: { name: true, platform: true },
    orderBy: { name: "asc" },
  });
  return Response.json({ hosts, brands });
}
