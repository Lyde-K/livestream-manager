import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const brandId  = searchParams.get("brandId");
  const month    = searchParams.get("month"); // YYYY-MM
  const platform = searchParams.get("platform"); // TIKTOK | SHOPEE | (omit = both)

  if (!brandId || !month)
    return Response.json({ error: "brandId and month are required" }, { status: 400 });

  const monthStart = new Date(`${month}-01T00:00:00+08:00`);
  const monthEnd   = new Date(new Date(monthStart).setMonth(monthStart.getMonth() + 1));

  const where: Record<string, unknown> = {
    brandId,
    scheduledStart: { gte: monthStart, lt: monthEnd },
    status: "COMPLETED",
  };
  if (platform && platform !== "ALL") where.platform = platform;

  const sessions = await prisma.session.findMany({
    where,
    orderBy: { scheduledStart: "asc" },
    select: {
      id: true,
      externalRef: true,
      platform: true,
      title: true,
      scheduledStart: true,
      scheduledEnd: true,
      actualStart: true,
      actualDurationMinutes: true,
      isCampaignDay: true,
      punctuality: true,
      gmv: true,
      grossRevenue: true,
      adsCost: true,
      itemsSold: true,
      itemsSoldPlaced: true,
      ordersPlaced: true,
      ordersConfirmed: true,
      salesPlaced: true,
      views: true,
      viewers: true,
      engagedViewers: true,
      productImpressions: true,
      productClicks: true,
      addToCart: true,
      ctr: true,
      ctor: true,
      newFollowers: true,
      comments: true,
      shares: true,
      likes: true,
      avgViewDurationSec: true,
      liveHost: { select: { displayName: true } },
      brand: { select: { name: true } },
    },
  });

  return Response.json({ sessions });
}
