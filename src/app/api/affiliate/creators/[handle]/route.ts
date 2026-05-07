import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAffiliateScope } from "@/lib/affiliate/scope";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  const scope = await getAffiliateScope(user);
  if (scope.brandIds.length === 0) return Response.json({ history: [], byBrand: [] });

  const { handle } = await params;
  const creatorName = decodeURIComponent(handle);

  const rows = await prisma.affiliateCreatorStat.findMany({
    where: {
      creatorName,
      brandId: { in: scope.brandIds },
    },
    include: { brand: { select: { id: true, name: true, color: true } } },
    orderBy: [{ period: "desc" }, { brandId: "asc" }],
  });

  if (rows.length === 0) return Response.json({ creatorName, history: [], byBrand: [] });

  const byBrandMap = new Map<string, {
    brand: { id: string; name: string; color: string };
    months: number;
    totalGmv: number;
    totalCommission: number;
    totalVideos: number;
    totalLives: number;
    totalSamples: number;
    latestLabel: string | null;
    latestPeriod: string;
  }>();

  for (const r of rows) {
    const existing = byBrandMap.get(r.brandId);
    if (!existing) {
      byBrandMap.set(r.brandId, {
        brand: r.brand,
        months: 1,
        totalGmv: Number(r.gmv),
        totalCommission: Number(r.estCommission),
        totalVideos: r.videos,
        totalLives: r.liveStreams,
        totalSamples: r.samplesShipped,
        latestLabel: r.label,
        latestPeriod: r.period,
      });
    } else {
      existing.months++;
      existing.totalGmv += Number(r.gmv);
      existing.totalCommission += Number(r.estCommission);
      existing.totalVideos += r.videos;
      existing.totalLives += r.liveStreams;
      existing.totalSamples += r.samplesShipped;
      if (r.period > existing.latestPeriod) {
        existing.latestPeriod = r.period;
        existing.latestLabel = r.label;
      }
    }
  }

  return Response.json({
    creatorName,
    isAdmin: scope.isAdmin,
    history: rows.map((r) => ({
      id: r.id,
      period: r.period,
      brand: r.brand,
      gmv: Number(r.gmv),
      estCommission: Number(r.estCommission),
      roi: r.roi == null ? null : Number(r.roi),
      videos: r.videos,
      liveStreams: r.liveStreams,
      samplesShipped: r.samplesShipped,
      rank: r.rank,
      label: r.label,
    })),
    byBrand: Array.from(byBrandMap.values()).sort((a, b) => b.totalGmv - a.totalGmv),
  });
}
