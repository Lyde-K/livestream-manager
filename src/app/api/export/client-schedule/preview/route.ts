import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const brandId   = searchParams.get("brandId");
  const month     = searchParams.get("month");  // "YYYY-MM" — used for monthly mode
  const startParam = searchParams.get("start"); // ISO — used for custom range mode
  const endParam   = searchParams.get("end");   // ISO — used for custom range mode

  if (!brandId) return Response.json({ error: "brandId required" }, { status: 400 });

  let startMYT: Date, endMYT: Date;
  if (startParam && endParam) {
    startMYT = new Date(startParam);
    endMYT   = new Date(endParam);
  } else if (month) {
    const [year, mo] = month.split("-").map(Number);
    startMYT = new Date(Date.UTC(year, mo - 1, 1, -8, 0, 0));
    endMYT   = new Date(Date.UTC(year, mo,     1, -8, 0, 0));
  } else {
    return Response.json({ error: "month or start+end required" }, { status: 400 });
  }

  const user = session.user as { id: string; role: string };

  // CLIENT role: verify they own this brand
  if (user.role === "CLIENT") {
    const client = await prisma.client.findUnique({ where: { userId: user.id }, include: { brands: true } });
    const owns = client?.brands.some(b => b.id === brandId);
    if (!owns) return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessions = await prisma.session.findMany({
    where: { brandId, scheduledStart: { gte: startMYT, lt: endMYT } },
    select: { scheduledStart: true, scheduledEnd: true },
  });

  const totalHours = sessions.reduce((sum, s) => {
    const hrs = (new Date(s.scheduledEnd).getTime() - new Date(s.scheduledStart).getTime()) / 3_600_000;
    return sum + hrs;
  }, 0);

  // Estimate file size: ~2 KB overhead + ~120 bytes per row
  const estimatedBytes = 2048 + sessions.length * 120;

  return Response.json({
    sessions: sessions.length,
    hours: Math.round(totalHours * 10) / 10,
    estimatedBytes,
  });
}
