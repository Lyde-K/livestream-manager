import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const month = sp.get("month");
  const year = sp.get("year");
  const platform = sp.get("platform");

  const where: Record<string, unknown> = {};
  if (month) where.month = parseInt(month);
  if (year)  where.year  = parseInt(year);
  if (platform) where.platform = { in: [platform, "BOTH"] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campaigns = await (prisma as any).campaign.findMany({
    where,
    include: { brand: { select: { id: true, name: true, color: true } } },
    orderBy: { startDate: "asc" },
  });
  return Response.json(campaigns, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { name, platform, startDate, endDate, brandId, notes } = await req.json();
  if (!name || !platform || !startDate || !endDate)
    return Response.json({ error: "name, platform, startDate and endDate are required" }, { status: 400 });

  const start = new Date(startDate);
  const end   = new Date(endDate);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campaign = await (prisma as any).campaign.create({
    data: {
      name, platform,
      startDate: start,
      endDate:   end,
      month: start.getMonth() + 1,
      year:  start.getFullYear(),
      brandId: brandId || null,
      notes: notes || null,
    },
    include: { brand: { select: { id: true, name: true, color: true } } },
  });
  return Response.json(campaign, { status: 201 });
}
