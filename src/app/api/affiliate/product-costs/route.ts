import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const brandId = sp.get("brandId");
  const period = sp.get("period");

  if (!brandId || !period) {
    return Response.json({ products: [], costs: [] });
  }

  const [products, costs] = await Promise.all([
    prisma.affiliateProductStat.findMany({
      where: { brandId, period },
      select: { productId: true, productName: true, samplesShipped: true },
      orderBy: { productName: "asc" },
    }),
    prisma.affiliateProductCost.findMany({
      where: { brandId, period },
      orderBy: { productName: "asc" },
    }),
  ]);

  return Response.json({
    products: products.map((p) => ({
      productId: p.productId,
      productName: p.productName,
      samplesShipped: p.samplesShipped,
    })),
    costs: costs.map((c) => ({
      id: c.id,
      brandId: c.brandId,
      period: c.period,
      productId: c.productId,
      productName: c.productName,
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
  const body = (await req.json()) as {
    brandId?: string;
    period?: string;
    productId?: string;
    productName?: string;
    unitCost?: number;
    notes?: string;
  };
  if (!body.brandId || !body.period || !body.productId || !body.productName || body.unitCost == null) {
    return Response.json({ error: "brandId, period, productId, productName, unitCost required" }, { status: 400 });
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.period)) {
    return Response.json({ error: "period must be YYYY-MM" }, { status: 400 });
  }
  const cost = await prisma.affiliateProductCost.upsert({
    where: { brandId_period_productId: { brandId: body.brandId, period: body.period, productId: body.productId } },
    create: { brandId: body.brandId, period: body.period, productId: body.productId, productName: body.productName, unitCost: body.unitCost, notes: body.notes ?? null },
    update: { unitCost: body.unitCost, productName: body.productName, notes: body.notes ?? null },
  });
  return Response.json({ ok: true, cost: { id: cost.id, brandId: cost.brandId, period: cost.period, productId: cost.productId, productName: cost.productName, unitCost: Number(cost.unitCost), notes: cost.notes } });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await prisma.affiliateProductCost.delete({ where: { id } });
  return Response.json({ ok: true });
}
