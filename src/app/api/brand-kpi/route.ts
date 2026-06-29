export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function padM(m: number) {
  return String(m).padStart(2, "0");
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate(); // month is 1-based, so this works
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const month = Number(searchParams.get("month")) || now.getMonth() + 1;
  const year = Number(searchParams.get("year")) || now.getFullYear();

  // Previous calendar month (1-based)
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const lastDay = daysInMonth(prevYear, prevMonth);

  const prevStart = new Date(`${prevYear}-${padM(prevMonth)}-01T00:00:00+08:00`);
  const prevEnd = new Date(`${prevYear}-${padM(prevMonth)}-${padM(lastDay)}T23:59:59+08:00`);

  // Fetch all active brands
  const brands = await prisma.brand.findMany({
    where: { isActive: true, hasLivestream: true },
    select: { id: true, name: true, platform: true, color: true },
    orderBy: { name: "asc" },
  });

  const brandIds = brands.map((b) => b.id);

  // Fetch GMV targets for this month
  const gmvTargets = await prisma.monthlyGMVTarget.findMany({
    where: { brandId: { in: brandIds }, month, year },
  });
  const gmvTargetMap = new Map(gmvTargets.map((g) => [g.brandId, g.target]));

  // Fetch saved BrandKPIConfig for this month
  const kpiConfigs = await prisma.brandKPIConfig.findMany({
    where: { brandId: { in: brandIds }, month, year },
  });
  const kpiConfigMap = new Map(kpiConfigs.map((k) => [k.brandId, k]));

  // Fetch completed sessions from previous month
  const prevSessions = await prisma.session.findMany({
    where: {
      brandId: { in: brandIds },
      status: "COMPLETED",
      scheduledStart: { gte: prevStart, lte: prevEnd },
    },
    select: {
      brandId: true,
      isCampaignDay: true,
      gmv: true,
      actualDurationMinutes: true,
    },
  });

  // Aggregate prev month data per brand
  type PrevData = { bauGMV: number; bauHours: number; campGMV: number; campHours: number };
  const prevMap = new Map<string, PrevData>();
  for (const s of prevSessions) {
    const existing = prevMap.get(s.brandId) ?? { bauGMV: 0, bauHours: 0, campGMV: 0, campHours: 0 };
    const hours = (s.actualDurationMinutes ?? 0) / 60;
    const gmv = s.gmv ?? 0;
    if (s.isCampaignDay) {
      existing.campGMV += gmv;
      existing.campHours += hours;
    } else {
      existing.bauGMV += gmv;
      existing.bauHours += hours;
    }
    prevMap.set(s.brandId, existing);
  }

  const result = brands.map((brand) => {
    const gmvTarget = Number(gmvTargetMap.get(brand.id) ?? 0);
    const kpiConfig = kpiConfigMap.get(brand.id) ?? null;
    const prev = prevMap.get(brand.id) ?? { bauGMV: 0, bauHours: 0, campGMV: 0, campHours: 0 };

    const bauAvgPerHr = prev.bauHours > 0 ? prev.bauGMV / prev.bauHours : 0;
    const campAvgPerHr = prev.campHours > 0 ? prev.campGMV / prev.campHours : 0;

    const recommended = {
      bauTier1: bauAvgPerHr * 1.3,
      bauTier2: bauAvgPerHr * 1.8,
      campTier1: campAvgPerHr * 1.3,
      campTier2: campAvgPerHr * 1.8,
    };

    let estCommission: { kpi1: number; kpi2: number } | null = null;
    if (kpiConfig && gmvTarget > 0) {
      const kpiRate = kpiConfig.kpiRate;
      estCommission = {
        kpi1: gmvTarget * (kpiRate / 100),
        kpi2: gmvTarget * (kpiRate / 100),
      };
    }

    return {
      brand,
      gmvTarget,
      kpiConfig: kpiConfig
        ? {
            id: kpiConfig.id,
            plannedHours: kpiConfig.plannedHours,
            kpiRate: kpiConfig.kpiRate,
            bauTier1: kpiConfig.bauTier1,
            bauTier2: kpiConfig.bauTier2,
            campTier1: kpiConfig.campTier1,
            campTier2: kpiConfig.campTier2,
          }
        : null,
      prevMonth: prev,
      recommended,
      estCommission,
    };
  });

  return Response.json({ month, year, brands: result });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    month: number;
    year: number;
    brands: {
      brandId: string;
      plannedHours: number;
      kpiRate: number;
      bauTier1: number;
      bauTier2: number;
      campTier1: number;
      campTier2: number;
    }[];
  };

  const { month, year, brands } = body;

  const results = await Promise.all(
    brands.map((b) =>
      prisma.brandKPIConfig.upsert({
        where: { brandId_month_year: { brandId: b.brandId, month, year } },
        update: {
          plannedHours: b.plannedHours,
          kpiRate: b.kpiRate,
          bauTier1: b.bauTier1,
          bauTier2: b.bauTier2,
          campTier1: b.campTier1,
          campTier2: b.campTier2,
        },
        create: {
          brandId: b.brandId,
          month,
          year,
          plannedHours: b.plannedHours,
          kpiRate: b.kpiRate,
          bauTier1: b.bauTier1,
          bauTier2: b.bauTier2,
          campTier1: b.campTier1,
          campTier2: b.campTier2,
        },
      })
    )
  );

  return Response.json({ success: true, count: results.length });
}
