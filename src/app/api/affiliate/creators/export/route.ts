import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAffiliateScope, assertBrandAccess } from "@/lib/affiliate/scope";
import ExcelJS from "exceljs";

const SORT_FIELDS = new Set([
  "rank", "gmv", "roi", "videos", "liveStreams", "samplesShipped", "estCommission",
]);

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  const scope = await getAffiliateScope(user);
  if (scope.brandIds.length === 0) return Response.json({ error: "No affiliate brands" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const brandId = sp.get("brandId");
  const period = sp.get("period");
  const search = (sp.get("search") ?? "").trim();
  const label = sp.get("label");
  const sortBy = sp.get("sortBy") ?? "rank";
  const sortDir = sp.get("sortDir") === "desc" ? "desc" : "asc";

  if (!period) return Response.json({ error: "period is required" }, { status: 400 });
  if (brandId && !assertBrandAccess(scope, brandId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!SORT_FIELDS.has(sortBy)) {
    return Response.json({ error: `invalid sortBy: ${sortBy}` }, { status: 400 });
  }

  const brandFilter = brandId ?? { in: scope.brandIds };
  const multiBrand = !brandId && scope.brandIds.length > 1;

  // ── Fetch all rows (no pagination cap for export) ────────────────────────────
  let rows: {
    id: string; creatorName: string; period: string; rank: number | null;
    gmv: number; estCommission: number; roi: number | null;
    videos: number; liveStreams: number; samplesShipped: number;
    label: string | null; brand: { name: string };
  }[] = [];

  if (period === "YTD") {
    const latest = await prisma.affiliateCreatorStat.findFirst({
      where: { brandId: brandFilter },
      orderBy: { period: "desc" },
      select: { period: true },
    });
    if (!latest) return Response.json({ error: "No data" }, { status: 404 });

    const ytdYear = latest.period.substring(0, 4);

    const groupByWhere: {
      brandId: string | { in: string[] };
      period: { startsWith: string };
      creatorName?: { contains: string; mode: "insensitive" };
    } = { brandId: brandFilter, period: { startsWith: `${ytdYear}-` } };
    if (search) groupByWhere.creatorName = { contains: search, mode: "insensitive" };

    const [grouped, latestRows] = await Promise.all([
      prisma.affiliateCreatorStat.groupBy({
        by: ["creatorName", "brandId"],
        where: groupByWhere,
        _sum: { gmv: true, estCommission: true, videos: true, liveStreams: true, samplesShipped: true },
      }),
      prisma.affiliateCreatorStat.findMany({
        where: { brandId: brandFilter, period: latest.period },
        select: { creatorName: true, brandId: true, label: true },
      }),
    ]);

    const brandIds = [...new Set(grouped.map((g) => g.brandId))];
    const brands = await prisma.brand.findMany({
      where: { id: { in: brandIds } },
      select: { id: true, name: true, color: true },
    });
    const brandMap = new Map(brands.map((b) => [b.id, b]));
    const latestMap = new Map(latestRows.map((r) => [`${r.brandId}|${r.creatorName}`, r.label]));

    let results = grouped.map((g) => {
      const brand = brandMap.get(g.brandId) ?? { id: g.brandId, name: "", color: "" };
      const gmv = Number(g._sum.gmv ?? 0);
      const estCommission = Number(g._sum.estCommission ?? 0);
      return {
        creatorName: g.creatorName,
        gmv, estCommission,
        videos: g._sum.videos ?? 0,
        liveStreams: g._sum.liveStreams ?? 0,
        samplesShipped: g._sum.samplesShipped ?? 0,
        latestLabel: latestMap.get(`${g.brandId}|${g.creatorName}`) ?? null,
        brand,
      };
    });

    if (label) results = results.filter((r) => r.latestLabel === label);

    const byGmv = [...results].sort((a, b) => b.gmv - a.gmv);
    const rankMap = new Map(byGmv.map((r, i) => [`${r.brand.name}|${r.creatorName}`, i + 1]));

    results.sort((a, b) => {
      let av = 0, bv = 0;
      if (sortBy === "rank")               { av = rankMap.get(`${a.brand.name}|${a.creatorName}`) ?? 99999; bv = rankMap.get(`${b.brand.name}|${b.creatorName}`) ?? 99999; }
      else if (sortBy === "gmv")           { av = a.gmv; bv = b.gmv; }
      else if (sortBy === "roi")           { av = a.estCommission > 0 ? a.gmv / a.estCommission : 0; bv = b.estCommission > 0 ? b.gmv / b.estCommission : 0; }
      else if (sortBy === "videos")        { av = a.videos; bv = b.videos; }
      else if (sortBy === "samplesShipped"){ av = a.samplesShipped; bv = b.samplesShipped; }
      else if (sortBy === "estCommission") { av = a.estCommission; bv = b.estCommission; }
      return sortDir === "asc" ? av - bv : bv - av;
    });

    rows = results.map((a) => ({
      id: `${a.brand.name}|${a.creatorName}|ytd`,
      creatorName: a.creatorName,
      period: `${ytdYear} YTD`,
      rank: rankMap.get(`${a.brand.name}|${a.creatorName}`) ?? null,
      gmv: a.gmv, estCommission: a.estCommission,
      roi: a.estCommission > 0 ? a.gmv / a.estCommission : null,
      videos: a.videos, liveStreams: a.liveStreams, samplesShipped: a.samplesShipped,
      label: a.latestLabel, brand: a.brand,
    }));

  } else {
    // Regular monthly period — fetch all (no limit)
    const where: {
      brandId: string | { in: string[] };
      period: string;
      creatorName?: { contains: string; mode: "insensitive" };
      label?: string;
    } = { brandId: brandFilter, period };
    if (search) where.creatorName = { contains: search, mode: "insensitive" };
    if (label) where.label = label;

    const rawRows = await prisma.affiliateCreatorStat.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      include: { brand: { select: { id: true, name: true, color: true } } },
    });

    rows = rawRows.map((r) => ({
      id: r.id, creatorName: r.creatorName, period: r.period,
      rank: r.rank, gmv: Number(r.gmv), estCommission: Number(r.estCommission),
      roi: r.roi == null ? null : Number(r.roi), videos: r.videos,
      liveStreams: r.liveStreams, samplesShipped: r.samplesShipped,
      label: r.label, brand: r.brand,
    }));
  }

  // ── Build Excel workbook ─────────────────────────────────────────────────────
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "13 Media Livestream Manager";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Affiliate Creators", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // Define columns (using Partial<ExcelJS.Column> which is accepted by sheet.columns setter)
  type ColDef = { header: string; key: string; width: number };
  const columns: ColDef[] = [
    { header: "Rank",       key: "rank",           width: 8 },
    { header: "Creator",    key: "creatorName",     width: 28 },
  ];
  if (multiBrand) columns.push({ header: "Brand", key: "brand", width: 18 });
  columns.push(
    { header: "Period",               key: "period",         width: 14 },
    { header: "GMV (RM)",             key: "gmv",            width: 16 },
    { header: "Est. Commission (RM)", key: "estCommission",  width: 20 },
    { header: "ROI",                  key: "roi",            width: 10 },
    { header: "Videos",               key: "videos",         width: 10 },
    { header: "Live Streams",         key: "liveStreams",    width: 13 },
    { header: "Samples Shipped",      key: "samplesShipped", width: 16 },
    { header: "Label",                key: "label",          width: 10 },
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sheet.columns = columns as any;

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
  headerRow.alignment = { vertical: "middle" };
  headerRow.height = 20;

  // Add data rows
  for (const r of rows) {
    const row: Record<string, string | number | null> = {
      rank:          r.rank,
      creatorName:   r.creatorName,
      period:        r.period,
      gmv:           parseFloat(r.gmv.toFixed(2)),
      estCommission: parseFloat(r.estCommission.toFixed(2)),
      roi:           r.roi != null ? parseFloat(r.roi.toFixed(2)) : null,
      videos:        r.videos,
      liveStreams:   r.liveStreams,
      samplesShipped: r.samplesShipped,
      label:         r.label,
    };
    if (multiBrand) row.brand = r.brand.name;
    const sheetRow = sheet.addRow(row);

    // Color ROI cell
    if (r.roi != null) {
      const roiCol = sheet.getColumn("roi");
      const roiCell = sheetRow.getCell(roiCol.number);
      if (r.roi >= 2) roiCell.font = { color: { argb: "FF10b981" } };
      else if (r.roi < 1) roiCell.font = { color: { argb: "FFef4444" } };
    }

    // Color label cell
    const labelCol = sheet.getColumn("label");
    const labelCell = sheetRow.getCell(labelCol.number);
    const labelColors: Record<string, string> = {
      STAR: "FFf59e0b", A: "FF10b981", B: "FF64748b", F: "FFef4444",
    };
    if (r.label && labelColors[r.label]) {
      labelCell.font = { color: { argb: labelColors[r.label] }, bold: r.label === "STAR" };
    }
  }

  // Format number columns
  ["gmv", "estCommission"].forEach((key) => {
    sheet.getColumn(key).numFmt = '#,##0.00';
  });
  sheet.getColumn("roi").numFmt = '0.0"x"';

  // Auto-filter on header
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  // Build filename
  const safePeriod = period.replace(/\.\./g, "-to-").replace(/\s/g, "-");
  const filename = `affiliate-creators-${safePeriod}${label ? `-${label}` : ""}.xlsx`;

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
