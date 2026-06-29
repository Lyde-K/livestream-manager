export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/sessions/debug?brandId=&month=YYYY-MM
 * Returns all sessions for a brand+month with externalRef and GMV for debugging import issues.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const brandId = searchParams.get("brandId");
  const month   = searchParams.get("month"); // YYYY-MM
  const platform = searchParams.get("platform");

  if (!brandId || !month)
    return Response.json({ error: "brandId and month required" }, { status: 400 });

  const [year, mon] = month.split("-").map(Number);
  const monthStart = new Date(`${month}-01T00:00:00+08:00`);
  const nextYear   = mon === 12 ? year + 1 : year;
  const nextMon    = mon === 12 ? 1 : mon + 1;
  const monthEnd   = new Date(`${nextYear}-${String(nextMon).padStart(2, "0")}-01T00:00:00+08:00`);

  const where: Record<string, unknown> = {
    brandId,
    scheduledStart: { gte: monthStart, lt: monthEnd },
  };
  if (platform) where.platform = platform;

  const sessions = await prisma.session.findMany({
    where,
    select: {
      id: true,
      externalRef: true,
      platform: true,
      status: true,
      scheduledStart: true,
      gmv: true,
      liveHostId: true,
      liveHost: { select: { displayName: true } },
      title: true,
    },
    orderBy: { scheduledStart: "asc" },
  });

  const summary = {
    total: sessions.length,
    totalGMV: sessions.reduce((s, r) => s + (r.gmv ?? 0), 0),
    byType: {
      adminCreated: sessions.filter(s => !s.externalRef || (!s.externalRef.startsWith("TT-") && !s.externalRef.startsWith("SP-"))).length,
      shopeeImported: sessions.filter(s => s.externalRef?.startsWith("SP-")).length,
      tiktokImported: sessions.filter(s => s.externalRef?.startsWith("TT-")).length,
    },
  };

  return Response.json({ summary, sessions });
}
