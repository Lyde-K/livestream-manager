import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAffiliateScope, assertBrandAccess } from "@/lib/affiliate/scope";
import ExcelJS from "exceljs";

const SORT_FIELDS = new Set(["gmv", "roi", "itemsSold", "videos", "liveStreams", "estCommission"]);

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
  const tier = sp.get("tier");
  const category = sp.get("category");
  const sortBy = sp.get("sortBy") ?? "gmv";
  const sortDir = sp.get("sortDir") === "asc" ? "asc" : "desc";

  if (!period) return Response.json({ error: "period is required" }, { status: 400 });
  if (brandId && !assertBrandAccess(scope, brandId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!SORT_FIELDS.has(sortBy)) {
    return Response.json({ error: `invalid sortBy: ${sortBy}` }, { status: 400 });
  }

  const brandFilter = brandId ?? { in: scope.brandIds };
  const multiBrand = !brandId && scope.brandIds.length > 1;

  type ExportRow = {
    productId: string; productName: string; category: string | null;
    gmv: number; estCommission: number; roi: number | null;
    itemsSold: number; videos: number; liveStreams: number; samplesShipped: number;
    tier: string | null; period: string;
    brand: { name: string };
  };

  let rows: ExportRow[] = [];

  if (period === "YTD") {
    const latest = await prisma.affiliateProductStat.findFirst({
      where: { brandId: brandFilter },
      orderBy: { period: "desc" },
      select: { period: true },
    });
    if (!latest) return Response.json({ error: "No data" }, { status: 404 });

    const ytdYear = latest.period.substring(0, 4);

    const groupByWhere: {
      brandId: string | { in: string[] };
      period: { startsWith: string };
      productName?: { contains: string; mode: "insensitive" };
      tier?: string;
      category?: string;
    } = { brandId: brandFilter, period: { startsWith: `${ytdYear}-` } };
    if (search) groupByWhere.productName = { contains: search, mode: "insensitive" };
    if (tier) groupByWhere.tier = tier;
    if (category) groupByWhere.category = category;

    const [grouped, latestRows] = await Promise.all([
      prisma.affiliateProductStat.groupBy({
        by: ["productId", "productName", "brandId"],
        where: groupByWhere,
        _sum: { gmv: true, estCommission: true, itemsSold: true, videos: true, liveStreams: true, samplesShipped: true },
      }),
      prisma.affiliateProductStat.findMany({
        where: { brandId: brandFilter, period: latest.period },
        include: { brand: { select: { id: true, name: true, color: true } } },
      }),
    ]);

    const latestMap = new Map(latestRows.map((r) => [`${r.brandId}|${r.productId}`, r]));
    const brandIds = [...new Set(grouped.map((g) => g.brandId))];
    const brands = await prisma.brand.findMany({
      where: { id: { in: brandIds } },
      select: { id: true, name: true },
    });
    const brandMap = new Map(brands.map((b) => [b.id, b]));

    let results = grouped.map((g) => {
      const l = latestMap.get(`${g.brandId}|${g.productId}`);
      const gmv = Number(g._sum.gmv ?? 0);
      const estCommission = Number(g._sum.estCommission ?? 0);
      return {
        productId: g.productId,
        productName: g.productName,
        category: l?.category ?? null,
        gmv, estCommission,
        roi: estCommission > 0 ? gmv / estCommission : null,
        itemsSold: g._sum.itemsSold ?? 0,
        videos: g._sum.videos ?? 0,
        liveStreams: g._sum.liveStreams ?? 0,
        samplesShipped: g._sum.samplesShipped ?? 0,
        tier: l?.tier ?? null,
        period: `${ytdYear} YTD`,
        brand: brandMap.get(g.brandId) ?? { name: "" },
      };
    });

    results.sort((a, b) => {
      const av = ((a as unknown as Record<string, number>)[sortBy]) ?? 0;
      const bv = ((b as unknown as Record<string, number>)[sortBy]) ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });

    rows = results;
  } else {
    const where: {
      brandId: string | { in: string[] };
      period: string;
      productName?: { contains: string; mode: "insensitive" };
      tier?: string;
      category?: string;
    } = { brandId: brandFilter, period };
    if (search) where.productName = { contains: search, mode: "insensitive" };
    if (tier) where.tier = tier;
    if (category) where.category = category;

    const rawRows = await prisma.affiliateProductStat.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      include: { brand: { select: { id: true, name: true, color: true } } },
    });

    rows = rawRows.map((r) => ({
      productId: r.productId,
      productName: r.productName,
      category: r.category,
      gmv: Number(r.gmv),
      estCommission: Number(r.estCommission),
      roi: r.roi == null ? null : Number(r.roi),
      itemsSold: r.itemsSold,
      videos: r.videos,
      liveStreams: r.liveStreams,
      samplesShipped: r.samplesShipped,
      tier: r.tier,
      period: r.period,
      brand: r.brand,
    }));
  }

  // ── Build Excel workbook ─────────────────────────────────────────────────────
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "13 Media Livestream Manager";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Affiliate Products", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  type ColDef = { header: string; key: string; width: number };
  const columns: ColDef[] = [];
  if (multiBrand) columns.push({ header: "Brand", key: "brand", width: 18 });
  columns.push(
    { header: "Product Name",          key: "productName",    width: 40 },
    { header: "Product ID",            key: "productId",      width: 20 },
    { header: "Category",              key: "category",       width: 18 },
    { header: "Period",                key: "period",         width: 14 },
    { header: "Tier",                  key: "tier",           width: 14 },
    { header: "GMV (RM)",              key: "gmv",            width: 16 },
    { header: "Est. Commission (RM)",  key: "estCommission",  width: 20 },
    { header: "ROI",                   key: "roi",            width: 10 },
    { header: "Items Sold",            key: "itemsSold",      width: 12 },
    { header: "Videos",                key: "videos",         width: 10 },
    { header: "Live Streams",          key: "liveStreams",    width: 13 },
    { header: "Samples Shipped",       key: "samplesShipped", width: 16 },
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sheet.columns = columns as any;

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
  headerRow.alignment = { vertical: "middle" };
  headerRow.height = 20;

  for (const r of rows) {
    const row: Record<string, string | number | null> = {
      productName:    r.productName,
      productId:      r.productId,
      category:       r.category,
      period:         r.period,
      tier:           r.tier,
      gmv:            parseFloat(r.gmv.toFixed(2)),
      estCommission:  parseFloat(r.estCommission.toFixed(2)),
      roi:            r.roi != null ? parseFloat(r.roi.toFixed(2)) : null,
      itemsSold:      r.itemsSold,
      videos:         r.videos,
      liveStreams:    r.liveStreams,
      samplesShipped: r.samplesShipped,
    };
    if (multiBrand) row.brand = r.brand.name;
    const sheetRow = sheet.addRow(row);

    if (r.roi != null) {
      const roiCell = sheetRow.getCell(sheet.getColumn("roi").number);
      if (r.roi >= 2) roiCell.font = { color: { argb: "FF10b981" } };
      else if (r.roi < 1) roiCell.font = { color: { argb: "FFef4444" } };
    }

    const tierColors: Record<string, string> = {
      EXCEPTIONAL: "FF10b981", AVERAGE: "FF64748b", UNDERPERFORMING: "FFef4444",
    };
    if (r.tier && tierColors[r.tier]) {
      const tierCell = sheetRow.getCell(sheet.getColumn("tier").number);
      tierCell.font = { color: { argb: tierColors[r.tier] } };
    }
  }

  ["gmv", "estCommission"].forEach((key) => { sheet.getColumn(key).numFmt = "#,##0.00"; });
  sheet.getColumn("roi").numFmt = '0.0"x"';
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  const safePeriod = period.replace(/\.\./g, "-to-").replace(/\s/g, "-");
  const filename = `affiliate-products-${safePeriod}${tier ? `-${tier}` : ""}.xlsx`;

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
