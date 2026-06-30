export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET  ?month=&year=&brandId=&platform=&sortBy=gmv|units
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month    = Number(searchParams.get("month"));
  const year     = Number(searchParams.get("year"));
  const brandId  = searchParams.get("brandId") || undefined;
  const platform = searchParams.get("platform") || undefined;
  const sortBy   = searchParams.get("sortBy") === "units" ? "unitsSold" : "gmv";

  if (!month || !year) return Response.json({ error: "month and year required" }, { status: 400 });

  const rows = await prisma.productPerformance.findMany({
    where: {
      month, year,
      ...(brandId  ? { brandId }  : {}),
      ...(platform ? { platform } : {}),
    },
    include: { brand: { select: { id: true, name: true, color: true } } },
    orderBy: { [sortBy]: "desc" },
  });

  return Response.json(rows);
}

// POST — bulk upsert from import (array of rows)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { brandId, platform, month, year, rows, replace } = await req.json() as {
    brandId: string;
    platform: string;
    month: number;
    year: number;
    replace?: boolean; // if true, delete existing rows for this brand/platform/month/year first
    rows: {
      productId?: string;
      productName: string;
      gmv: number;
      unitsSold: number;
      orders?: number;
      clicks?: number;
      convRate?: number;
    }[];
  };

  if (!brandId || !platform || !month || !year || !Array.isArray(rows))
    return Response.json({ error: "brandId, platform, month, year, rows required" }, { status: 400 });

  if (replace) {
    await prisma.productPerformance.deleteMany({ where: { brandId, platform, month, year } });
  }

  const created = await prisma.productPerformance.createMany({
    data: rows.map(r => ({
      brandId, platform, month, year,
      productId:   r.productId ?? null,
      productName: r.productName,
      gmv:         r.gmv ?? 0,
      unitsSold:   r.unitsSold ?? 0,
      orders:      r.orders ?? 0,
      clicks:      r.clicks ?? 0,
      convRate:    r.convRate ?? null,
    })),
    skipDuplicates: false,
  });

  return Response.json({ ok: true, count: created.count });
}

// DELETE  ?brandId=&platform=&month=&year=
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const brandId  = searchParams.get("brandId");
  const platform = searchParams.get("platform");
  const month    = Number(searchParams.get("month"));
  const year     = Number(searchParams.get("year"));

  if (!brandId || !platform || !month || !year)
    return Response.json({ error: "required" }, { status: 400 });

  const { count } = await prisma.productPerformance.deleteMany({ where: { brandId, platform, month, year } });
  return Response.json({ ok: true, count });
}
