import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get("brandId");
  const month   = searchParams.get("month"); // "YYYY-MM"
  if (!brandId || !month) return Response.json({ error: "brandId and month required" }, { status: 400 });

  const [year, mo] = month.split("-").map(Number);
  // MYT month boundaries (UTC+8): start = first day 00:00 MYT, end = last day 23:59 MYT
  const startMYT = new Date(Date.UTC(year, mo - 1, 1, -8, 0, 0));   // 1st 00:00 MYT = prev day 16:00 UTC
  const endMYT   = new Date(Date.UTC(year, mo,     1, -8, 0, 0));    // 1st of next month 00:00 MYT

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
