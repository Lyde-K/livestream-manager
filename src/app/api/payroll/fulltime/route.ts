export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHostMonthlyStats } from "@/lib/commission";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const month = Number(searchParams.get("month")) || now.getMonth() + 1;
  const year = Number(searchParams.get("year")) || now.getFullYear();

  const hosts = await prisma.liveHost.findMany({
    where: { type: "FULL_TIME", isActive: true },
    include: { user: true },
    orderBy: { displayName: "asc" },
  });

  const results = await Promise.all(
    hosts.map(async (h) => {
      const stats = await getHostMonthlyStats(h.id, month, year);
      return {
        hostId: h.id,
        displayName: h.displayName,
        hostName: h.user.name,
        contactNo: h.contactNo,
        icNo: h.icNo,
        bankName: h.bankName,
        bankAccount: h.bankAccount,
        stats,
      };
    })
  );

  return Response.json(results);
}
