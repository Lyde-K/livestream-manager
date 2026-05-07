import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const [brands, costs] = await Promise.all([
    prisma.brand.findMany({
      where: { hasAffiliate: true, isActive: true },
      select: { id: true, name: true, color: true, client: { select: { user: { select: { name: true } } } } },
      orderBy: { name: "asc" },
    }),
    prisma.affiliateSampleCost.findMany({
      orderBy: [{ period: "desc" }, { brandId: "asc" }],
    }),
  ]);

  return Response.json({
    brands,
    costs: costs.map((c) => ({
      id: c.id,
      brandId: c.brandId,
      period: c.period,
      unitCost: Number(c.unitCost),
      notes: c.notes,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json()) as { brandId?: string; period?: string; unitCost?: number; notes?: string };
  if (!body.brandId || !body.period || body.unitCost == null) {
    return Response.json({ error: "brandId, period, unitCost required" }, { status: 400 });
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.period)) {
    return Response.json({ error: "period must be YYYY-MM" }, { status: 400 });
  }
  const cost = await prisma.affiliateSampleCost.upsert({
    where: { brandId_period: { brandId: body.brandId, period: body.period } },
    create: { brandId: body.brandId, period: body.period, unitCost: body.unitCost, notes: body.notes ?? null },
    update: { unitCost: body.unitCost, notes: body.notes ?? null },
  });
  return Response.json({ ok: true, cost: { id: cost.id, brandId: cost.brandId, period: cost.period, unitCost: Number(cost.unitCost), notes: cost.notes } });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await prisma.affiliateSampleCost.delete({ where: { id } });
  return Response.json({ ok: true });
}
