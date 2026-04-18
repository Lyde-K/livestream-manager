import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const month = Number(searchParams.get("month")) || new Date().getMonth() + 1;
  const year = Number(searchParams.get("year")) || new Date().getFullYear();
  const kpis = await prisma.kPIConfig.findMany({
    where: { month, year },
    include: { liveHost: { include: { user: true } }, brand: true },
    orderBy: [{ liveHost: { displayName: "asc" } }, { brand: { name: "asc" } }],
  });
  return Response.json(kpis);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });
  const data = await req.json();
  const kpi = await prisma.kPIConfig.upsert({
    where: { liveHostId_brandId_month_year: { liveHostId: data.liveHostId, brandId: data.brandId, month: data.month, year: data.year } },
    update: { tier1KpiNormal: data.tier1KpiNormal, tier2KpiNormal: data.tier2KpiNormal, tier1KpiCampaign: data.tier1KpiCampaign, tier2KpiCampaign: data.tier2KpiCampaign, baseCommissionRate: data.baseCommissionRate, tier1Rate: data.tier1Rate, tier2Rate: data.tier2Rate },
    create: { liveHostId: data.liveHostId, brandId: data.brandId, month: data.month, year: data.year, tier1KpiNormal: data.tier1KpiNormal, tier2KpiNormal: data.tier2KpiNormal, tier1KpiCampaign: data.tier1KpiCampaign, tier2KpiCampaign: data.tier2KpiCampaign, baseCommissionRate: data.baseCommissionRate, tier1Rate: data.tier1Rate, tier2Rate: data.tier2Rate },
  });
  return Response.json(kpi, { status: 201 });
}
