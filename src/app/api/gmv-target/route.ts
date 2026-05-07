import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get("brandId");
  const monthRaw = searchParams.get("month");
  const yearRaw  = searchParams.get("year");

  if (!brandId || monthRaw === null || yearRaw === null) {
    return NextResponse.json({ success: false, error: "Missing params" }, { status: 400 });
  }

  const month = parseInt(monthRaw);
  const year  = parseInt(yearRaw);

  if (isNaN(month) || isNaN(year)) {
    return NextResponse.json({ success: false, error: "Invalid month/year" }, { status: 400 });
  }

  const target = await prisma.monthlyGMVTarget.findUnique({
    where: { brandId_month_year: { brandId, month, year } },
  });

  return NextResponse.json({ success: true, data: target ?? null });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const user = session.user as { role: string };
  if (user.role !== "ADMIN") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as { brandId?: string; month?: number; year?: number; target?: number };
  const { brandId, month, year, target } = body;

  if (!brandId || month === undefined || year === undefined || target === undefined) {
    return NextResponse.json({ success: false, error: "Missing fields" }, { status: 400 });
  }

  const result = await prisma.monthlyGMVTarget.upsert({
    where: { brandId_month_year: { brandId, month, year } },
    update: { target },
    create: { brandId, month, year, target },
  });

  return NextResponse.json({ success: true, data: result });
}
