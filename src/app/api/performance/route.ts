import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHostMonthlyStats } from "@/lib/commission";
import { mytMonthYear } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const { month: mM, year: mY } = mytMonthYear();
  const month = Number(searchParams.get("month")) || mM;
  const year = Number(searchParams.get("year")) || mY;
  const hostId = searchParams.get("hostId");
  const user = session.user as { id: string; role: string };

  if (user.role === "LIVE_HOST") {
    const host = await prisma.liveHost.findUnique({ where: { userId: user.id } });
    if (!host) return Response.json({ error: "No host profile" }, { status: 404 });
    const [stats, violations] = await Promise.all([
      getHostMonthlyStats(host.id, month, year),
      prisma.hostViolation.findMany({
        where: { hostId: host.id, month, year },
        include: { brand: { select: { id: true, name: true } } },
        orderBy: { date: "asc" },
      }),
    ]);
    const violationDeduction = violations.reduce((s, v) => s + v.deductionAmount, 0);
    return Response.json({ ...stats, violations, violationDeduction });
  }

  if (hostId) {
    const stats = await getHostMonthlyStats(hostId, month, year);
    return Response.json(stats);
  }

  // Return all hosts summary
  const hosts = await prisma.liveHost.findMany({ where: { isActive: true } });
  const allStats = await Promise.all(hosts.map((h) => getHostMonthlyStats(h.id, month, year)));
  return Response.json(allStats.filter(Boolean));
}
