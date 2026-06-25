import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mytMonthYear, mytMonthRange } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const { month: mM, year: mY } = mytMonthYear();
  const month = Number(searchParams.get("month")) || mM;
  const year = Number(searchParams.get("year")) || mY;

  const { start: monthStart, end: monthEnd } = mytMonthRange(month, year);

  // Get all part-time hosts
  const partTimeHosts = await prisma.liveHost.findMany({
    where: { type: "PART_TIME", isActive: true },
    include: { user: true },
  });

  const results = await Promise.all(
    partTimeHosts.map(async (host) => {
      const sessions = await prisma.session.findMany({
        where: {
          liveHostId: host.id,
          scheduledStart: { gte: monthStart, lte: monthEnd },
          status: "COMPLETED",
        },
        include: { brand: true },
        orderBy: { scheduledStart: "asc" },
      });

      const totalMinutes = sessions.reduce(
        (sum, s) => sum + (s.actualDurationMinutes || 0),
        0
      );
      const totalHours = totalMinutes / 60;
      const hourlyRate = host.hourlyRate ?? 40;
      const totalPay = totalHours * hourlyRate;

      return {
        hostId: host.id,
        displayName: host.displayName,
        hourlyRate,
        contactNo: host.contactNo,
        icNo: host.icNo,
        bankName: host.bankName,
        bankAccount: host.bankAccount,
        totalSessions: sessions.length,
        totalMinutes,
        totalHours,
        totalPay,
        sessions: sessions.map((s) => ({
          id: s.id,
          brandName: s.brand.name,
          platform: s.platform,
          scheduledStart: s.scheduledStart,
          actualDurationMinutes: s.actualDurationMinutes,
          isCampaignDay: s.isCampaignDay,
          gmv: s.gmv,
        })),
      };
    })
  );

  return Response.json(results);
}
