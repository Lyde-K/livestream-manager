import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfWeek, endOfWeek, addWeeks, parseISO, format, isBefore, isAfter } from "date-fns";

// GET /api/brand-performance?start=YYYY-MM-DD&end=YYYY-MM-DD&prevStart=...&prevEnd=...
// Returns per-brand weekly GMV breakdown + targets
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const startStr = searchParams.get("start");
  const endStr   = searchParams.get("end");
  const prevStartStr = searchParams.get("prevStart");
  const prevEndStr   = searchParams.get("prevEnd");

  if (!startStr || !endStr)
    return Response.json({ error: "start and end required" }, { status: 400 });

  const rangeStart = new Date(startStr + "T00:00:00+08:00");
  const rangeEnd   = new Date(endStr   + "T23:59:59+08:00");

  // Build week buckets (Mon–Sun aligned, clipped to range)
  const weeks: { label: string; start: Date; end: Date }[] = [];
  let cursor = startOfWeek(rangeStart, { weekStartsOn: 1 });
  let weekIdx = 1;
  while (isBefore(cursor, rangeEnd)) {
    const wEnd = endOfWeek(cursor, { weekStartsOn: 1 });
    const clippedStart = isAfter(cursor, rangeStart) ? cursor : rangeStart;
    const clippedEnd   = isBefore(wEnd, rangeEnd)   ? wEnd   : rangeEnd;
    weeks.push({
      label: `W${weekIdx} (${format(clippedStart, "d MMM")}–${format(clippedEnd, "d MMM")})`,
      start: clippedStart,
      end:   clippedEnd,
    });
    cursor = addWeeks(cursor, 1);
    weekIdx++;
  }

  // Fetch current-period sessions
  const [sessions, brands, targets] = await Promise.all([
    prisma.session.findMany({
      where: {
        status: "COMPLETED",
        scheduledStart: { gte: rangeStart, lte: rangeEnd },
      },
      select: { brandId: true, gmv: true, scheduledStart: true, platform: true },
    }),
    prisma.brand.findMany({
      where: { isActive: true, hasLivestream: true },
      select: { id: true, name: true, platform: true, color: true },
      orderBy: { name: "asc" },
    }),
    prisma.monthlyGMVTarget.findMany({
      where: {
        // Fetch targets overlapping the range — by year+month combos in range
      },
    }),
  ]);

  // Fetch prev-period sessions for MoM growth
  let prevSessions: { brandId: string; gmv: number | null }[] = [];
  if (prevStartStr && prevEndStr) {
    const ps = new Date(prevStartStr + "T00:00:00+08:00");
    const pe = new Date(prevEndStr   + "T23:59:59+08:00");
    prevSessions = await prisma.session.findMany({
      where: { status: "COMPLETED", scheduledStart: { gte: ps, lte: pe } },
      select: { brandId: true, gmv: true },
    });
  }

  // Build target lookup: brandId → total target for the range
  // We sum targets for all year-month combos within [start, end]
  const targetByBrand: Record<string, number> = {};
  // Determine which year-month pairs fall in the range
  const monthSet = new Set<string>();
  let mc = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  while (mc <= rangeEnd) {
    monthSet.add(`${mc.getFullYear()}-${mc.getMonth()}`);
    mc = new Date(mc.getFullYear(), mc.getMonth() + 1, 1);
  }
  for (const t of targets) {
    const key = `${t.year}-${t.month}`;
    if (monthSet.has(key)) {
      targetByBrand[t.brandId] = (targetByBrand[t.brandId] ?? 0) + t.target;
    }
  }

  // Prev GMV by brand
  const prevGMVByBrand: Record<string, number> = {};
  for (const s of prevSessions) {
    prevGMVByBrand[s.brandId] = (prevGMVByBrand[s.brandId] ?? 0) + (s.gmv ?? 0);
  }

  // Per-brand week breakdown
  const brandMap = new Map(brands.map(b => [b.id, b]));
  const brandGMV: Record<string, number[]> = {};
  const brandTotal: Record<string, number> = {};

  for (const b of brands) {
    brandGMV[b.id] = new Array(weeks.length).fill(0);
    brandTotal[b.id] = 0;
  }

  for (const s of sessions) {
    const bIdx = brandGMV[s.brandId];
    if (!bIdx) continue;
    const st = new Date(s.scheduledStart);
    const gmv = s.gmv ?? 0;
    brandTotal[s.brandId] = (brandTotal[s.brandId] ?? 0) + gmv;
    for (let i = 0; i < weeks.length; i++) {
      if (st >= weeks[i].start && st <= weeks[i].end) {
        brandGMV[s.brandId][i] += gmv;
        break;
      }
    }
  }

  // Only return brands that had sessions or have targets
  const activeBrandIds = new Set([
    ...Object.keys(brandTotal).filter(id => brandTotal[id] > 0),
    ...Object.keys(targetByBrand),
  ]);

  const result = brands
    .filter(b => activeBrandIds.has(b.id))
    .map(b => ({
      id:           b.id,
      name:         b.name,
      platform:     b.platform,
      color:        b.color,
      target:       targetByBrand[b.id] ?? 0,
      totalGMV:     brandTotal[b.id] ?? 0,
      prevGMV:      prevGMVByBrand[b.id] ?? 0,
      weeklyGMV:    brandGMV[b.id] ?? new Array(weeks.length).fill(0),
    }));

  return Response.json({
    brands: result,
    weeks: weeks.map(w => ({
      label: w.label,
      start: format(w.start, "yyyy-MM-dd"),
      end:   format(w.end,   "yyyy-MM-dd"),
    })),
  });
}

// PUT /api/brand-performance  { brandId, year, month, target }
// Upserts a monthly GMV target
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { brandId, year, month, target } = await req.json() as {
    brandId: string; year: number; month: number; target: number;
  };

  if (!brandId || year == null || month == null || target == null)
    return Response.json({ error: "brandId, year, month, target required" }, { status: 400 });

  const record = await prisma.monthlyGMVTarget.upsert({
    where: { brandId_month_year: { brandId, month, year } },
    update: { target },
    create: { brandId, month, year, target },
  });

  return Response.json({ ok: true, record });
}
