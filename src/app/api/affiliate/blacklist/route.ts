import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAffiliateScope, assertBrandAccess } from "@/lib/affiliate/scope";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  const scope = await getAffiliateScope(user);
  if (scope.brandIds.length === 0) return Response.json({ rows: [] });

  const sp = req.nextUrl.searchParams;
  const brandId = sp.get("brandId");
  const period = sp.get("period");
  const format = sp.get("format");

  if (!period) return Response.json({ error: "period is required" }, { status: 400 });
  if (brandId && !assertBrandAccess(scope, brandId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.affiliateCreatorStat.findMany({
    where: {
      brandId: brandId ?? { in: scope.brandIds },
      period,
      label: "F",
    },
    include: { brand: { select: { name: true } } },
    orderBy: { samplesShipped: "desc" },
  });

  if (format === "csv") {
    const header = ["Brand", "Period", "Creator", "Samples Shipped", "Videos", "Live Streams", "GMV (RM)", "Est Commission (RM)", "ROI", "Reason"];
    const csv = [header.join(",")];
    for (const r of rows) {
      const gmv = Number(r.gmv);
      const commission = Number(r.estCommission);
      const roi = r.roi == null ? 0 : Number(r.roi);
      const reasons: string[] = [];
      if (r.samplesShipped > 0 && r.videos === 0 && r.liveStreams === 0) reasons.push("Samples shipped, no content");
      if (r.samplesShipped > 0 && gmv === 0) reasons.push("Samples shipped, no GMV");
      if (roi > 0 && roi < 1) reasons.push("ROI below 1x");
      const reason = reasons.join("; ") || "Underperforming";
      const fields = [
        r.brand.name,
        r.period,
        r.creatorName,
        String(r.samplesShipped),
        String(r.videos),
        String(r.liveStreams),
        gmv.toFixed(2),
        commission.toFixed(2),
        roi.toFixed(2),
        reason,
      ].map((v) => `"${v.replace(/"/g, '""')}"`);
      csv.push(fields.join(","));
    }
    const filename = `blacklist-${period}${brandId ? "" : "-all"}.csv`;
    return new Response(csv.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return Response.json({
    rows: rows.map((r) => ({
      id: r.id,
      creatorName: r.creatorName,
      period: r.period,
      gmv: Number(r.gmv),
      estCommission: Number(r.estCommission),
      roi: r.roi == null ? null : Number(r.roi),
      videos: r.videos,
      liveStreams: r.liveStreams,
      samplesShipped: r.samplesShipped,
      brand: r.brand,
    })),
  });
}
