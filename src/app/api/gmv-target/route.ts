/**
 * /api/gmv-target — read/write a single brand's monthly GMV target.
 * month param is 1-based (1=Jan, 12=Dec) — see src/lib/gmv-targets.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGMVTarget, upsertGMVTarget } from "@/lib/gmv-targets";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const brandId  = searchParams.get("brandId");
  const monthRaw = searchParams.get("month");
  const yearRaw  = searchParams.get("year");

  if (!brandId || monthRaw === null || yearRaw === null)
    return NextResponse.json({ success: false, error: "Missing params" }, { status: 400 });

  const month = parseInt(monthRaw); // 1-based
  const year  = parseInt(yearRaw);
  if (isNaN(month) || isNaN(year))
    return NextResponse.json({ success: false, error: "Invalid month/year" }, { status: 400 });

  const target = await getGMVTarget(brandId, month, year);
  return NextResponse.json({ success: true, data: target > 0 ? { target } : null });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "ADMIN")
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { brandId?: string; month?: number; year?: number; target?: number };
  const { brandId, month, year, target } = body; // month is 1-based

  if (!brandId || month === undefined || year === undefined || target === undefined)
    return NextResponse.json({ success: false, error: "Missing fields" }, { status: 400 });

  const result = await upsertGMVTarget(brandId, month, year, target);
  return NextResponse.json({ success: true, data: result });
}
