import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

interface SheetRow {
  platform: string;
  title?: string;
  // from TikTok/Shopee export — startTime as "2026-03-31 20:00" or "26-03-2026 21:57"
  startTime: string;
  durationSec?: number | null;
  // metrics
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
  addToCart?: number | null;
  ordersPlaced?: number | null;
  ordersConfirmed?: number | null;
  itemsSold?: number | null;
  itemsSoldPlaced?: number | null;
  salesPlaced?: number | null;
  likes?: number | null;
  shares?: number | null;
  comments?: number | null;
  newFollowers?: number | null;
  avgViewDuration?: string | null;
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

function parseDT(s: string): Date | null {
  if (!s) return null;
  // "2026-03-31 20:00" (TikTok)
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) {
    return new Date(s.replace(" ", "T") + ":00");
  }
  // "26-03-2026 21:57" (Shopee DD-MM-YYYY HH:MM)
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4}) (\d{2}:\d{2})/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:00`);
  return new Date(s);
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.SHEETS_SYNC_KEY)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { rows?: SheetRow[] };
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const rows: SheetRow[] = body.rows ?? [];
  if (!Array.isArray(rows) || rows.length === 0)
    return Response.json({ error: "No rows provided" }, { status: 400 });

  const allHosts = await prisma.liveHost.findMany({ where: { isActive: true } });
  const allBrands = await prisma.brand.findMany();
  const defaultRoom = await prisma.room.findFirst();
  const results = { upserted: 0, skipped: 0, errors: [] as string[] };

  for (const row of rows) {
    try {
      if (!row.host || !row.brand || !row.startTime) { results.skipped++; continue; }

      const host = allHosts.find(h => h.displayName.trim().toUpperCase() === row.host.trim().toUpperCase());
      if (!host) { results.errors.push(`Host not found: "${row.host}"`); results.skipped++; continue; }

      const brand = allBrands.find(b => b.name.trim().toUpperCase() === row.brand.trim().toUpperCase());
      if (!brand) { results.errors.push(`Brand not found: "${row.brand}"`); results.skipped++; continue; }

      const scheduledStart = parseDT(row.startTime);
      if (!scheduledStart || isNaN(scheduledStart.getTime())) {
        results.errors.push(`Bad startTime: "${row.startTime}"`); results.skipped++; continue;
      }

      const durationMs = row.durationSec ? row.durationSec * 1000 : 2 * 3600 * 1000;
      const scheduledEnd = new Date(scheduledStart.getTime() + durationMs);

      const platformRaw = (row.platform || "TikTok").trim().toUpperCase();
      const platform = platformRaw.includes("SHOPEE") || platformRaw === "SHP" ? "SHOPEE" : "TIKTOK";

      const dateStr = scheduledStart.toISOString().slice(0, 10);
      const startStr = scheduledStart.toISOString().slice(11, 16);
      const externalRef = `GS-${platform}-${dateStr}-${host.displayName}-${brand.name}-${startStr}`;

      // avg view duration: convert "HH:MM:SS" string to seconds
      let avgViewDurationSec: number | null = null;
      if (row.avgViewDuration) {
        const parts = String(row.avgViewDuration).split(":").map(Number);
        if (parts.length === 3) avgViewDurationSec = parts[0]*3600 + parts[1]*60 + parts[2];
        else if (parts.length === 2) avgViewDurationSec = parts[0]*60 + parts[1];
        else avgViewDurationSec = Number(row.avgViewDuration) || null;
      }

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
        actualDurationMinutes: row.durationSec ? Math.round(row.durationSec / 60) : null,
        isCampaignDay:      row.campaign ?? false,
        notes:              row.notes || null,
      };

      await prisma.session.upsert({
        where: { externalRef },
        update: { liveHostId: host.id, brandId: brand.id, platform, scheduledStart, scheduledEnd, status: "COMPLETED", ...metrics },
        create: {
          externalRef,
          roomId: defaultRoom?.id ?? "",
          liveHostId: host.id,
          brandId: brand.id,
          platform,
          scheduledStart,
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

  return Response.json({ ok: true, upserted: results.upserted, skipped: results.skipped, errors: results.errors.slice(0, 20) });
}

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.SHEETS_SYNC_KEY)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const hosts = await prisma.liveHost.findMany({ where: { isActive: true }, select: { displayName: true, type: true }, orderBy: { displayName: "asc" } });
  const brands = await prisma.brand.findMany({ select: { name: true, platform: true }, orderBy: { name: "asc" } });
  return Response.json({ hosts, brands });
}
