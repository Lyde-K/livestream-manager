/**
 * /api/brand-performance
 * GET  ?start=YYYY-MM-DD&end=YYYY-MM-DD&prevStart=...&prevEnd=...&groupBy=week|month
 * PUT  { brandId, year, month, target }  — month is 1-based
 */
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfWeek, endOfWeek, addWeeks, addMonths, startOfMonth, endOfMonth, format, isBefore, isAfter } from "date-fns";
import { getGMVTargetsForRange, upsertGMVTarget } from "@/lib/gmv-targets";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const startStr    = searchParams.get("start");
  const endStr      = searchParams.get("end");
  const prevStartStr = searchParams.get("prevStart");
  const prevEndStr   = searchParams.get("prevEnd");
  const groupBy      = (searchParams.get("groupBy") ?? "week") as "week" | "month";

  if (!startStr || !endStr)
    return Response.json({ error: "start and end required" }, { status: 400 });

  const rangeStart = new Date(startStr + "T00:00:00+08:00");
  const rangeEnd   = new Date(endStr   + "T23:59:59+08:00");

  // Build time buckets
  type Bucket = { label: string; sublabel?: string; start: Date; end: Date };
  const buckets: Bucket[] = [];

  if (groupBy === "month") {
    let cursor = startOfMonth(rangeStart);
    while (isBefore(cursor, rangeEnd)) {
      const mEnd = endOfMonth(cursor);
      const clippedStart = isAfter(cursor, rangeStart) ? cursor : rangeStart;
      const clippedEnd   = isBefore(mEnd, rangeEnd)   ? mEnd   : rangeEnd;
      buckets.push({
        label:    format(cursor, "MMM"),
        sublabel: format(cursor, "MMM yyyy"),
        start: clippedStart,
        end:   clippedEnd,
      });
      cursor = addMonths(cursor, 1);
    }
  } else {
    let cursor = startOfWeek(rangeStart, { weekStartsOn: 1 });
    let idx = 1;
    while (isBefore(cursor, rangeEnd)) {
      const wEnd = endOfWeek(cursor, { weekStartsOn: 1 });
      const clippedStart = isAfter(cursor, rangeStart) ? cursor : rangeStart;
      const clippedEnd   = isBefore(wEnd, rangeEnd)   ? wEnd   : rangeEnd;
      buckets.push({
        label:    `W${idx}`,
        sublabel: `W${idx} (${format(clippedStart, "d MMM")}–${format(clippedEnd, "d MMM")})`,
        start: clippedStart,
        end:   clippedEnd,
      });
      cursor = addWeeks(cursor, 1);
      idx++;
    }
  }

  const [sessions, brands, targets] = await Promise.all([
    prisma.session.findMany({
      where: { status: "COMPLETED", scheduledStart: { gte: rangeStart, lte: rangeEnd } },
      select: { brandId: true, gmv: true, scheduledStart: true },
    }),
    prisma.brand.findMany({
      where: { isActive: true, hasLivestream: true },
      select: { id: true, name: true, platform: true, color: true },
      orderBy: { name: "asc" },
    }),
    getGMVTargetsForRange(rangeStart, rangeEnd),
  ]);

  let prevSessions: { brandId: string; gmv: number | null }[] = [];
  if (prevStartStr && prevEndStr) {
    const ps = new Date(prevStartStr + "T00:00:00+08:00");
    const pe = new Date(prevEndStr   + "T23:59:59+08:00");
    prevSessions = await prisma.session.findMany({
      where: { status: "COMPLETED", scheduledStart: { gte: ps, lte: pe } },
      select: { brandId: true, gmv: true },
    });
  }

  const targetByBrand: Record<string, number> = {};
  for (const t of targets) targetByBrand[t.brandId] = (targetByBrand[t.brandId] ?? 0) + t.target;

  const prevGMVByBrand: Record<string, number> = {};
  for (const s of prevSessions) prevGMVByBrand[s.brandId] = (prevGMVByBrand[s.brandId] ?? 0) + (s.gmv ?? 0);

  const brandGMV: Record<string, number[]> = {};
  const brandTotal: Record<string, number> = {};
  for (const b of brands) { brandGMV[b.id] = new Array(buckets.length).fill(0); brandTotal[b.id] = 0; }

  for (const s of sessions) {
    if (!brandGMV[s.brandId]) continue;
    const st  = new Date(s.scheduledStart);
    const gmv = s.gmv ?? 0;
    brandTotal[s.brandId] += gmv;
    for (let i = 0; i < buckets.length; i++) {
      if (st >= buckets[i].start && st <= buckets[i].end) { brandGMV[s.brandId][i] += gmv; break; }
    }
  }

  const activeBrandIds = new Set([
    ...Object.keys(brandTotal).filter(id => brandTotal[id] > 0),
    ...Object.keys(targetByBrand),
  ]);

  const result = brands
    .filter(b => activeBrandIds.has(b.id))
    .map(b => ({
      id: b.id, name: b.name, platform: b.platform, color: b.color,
      target:    targetByBrand[b.id] ?? 0,
      totalGMV:  brandTotal[b.id]  ?? 0,
      prevGMV:   prevGMVByBrand[b.id] ?? 0,
      bucketGMV: brandGMV[b.id] ?? new Array(buckets.length).fill(0),
    }));

  return Response.json({
    brands: result,
    groupBy,
    buckets: buckets.map(b => ({
      label:    b.label,
      sublabel: b.sublabel,
      start:    format(b.start, "yyyy-MM-dd"),
      end:      format(b.end,   "yyyy-MM-dd"),
    })),
  });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { brandId, year, month, target } = await req.json() as {
    brandId: string; year: number; month: number; target: number; // month 1-based
  };

  if (!brandId || year == null || month == null || target == null)
    return Response.json({ error: "brandId, year, month, target required" }, { status: 400 });

  const record = await upsertGMVTarget(brandId, month, year, target);
  return Response.json({ ok: true, record });
}
