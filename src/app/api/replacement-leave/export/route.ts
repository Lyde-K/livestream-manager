import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeRLForHost } from "../route";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  const hosts = await prisma.liveHost.findMany({
    where: { isActive: true },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });

  const rows: string[] = [
    "Host,Total Hours,Units Earned,Units Expired,Units Used,Units Available,Hours To Next Unit,Leave Date,Leave Status,Category,Half Day,Applied At,Reviewed At,Admin Note",
  ];

  for (const h of hosts) {
    const summary = await computeRLForHost(h.id);
    const apps = await prisma.rLApplication.findMany({
      where: { liveHostId: h.id },
      orderBy: { leaveDate: "asc" },
    });

    if (apps.length === 0) {
      rows.push(
        `"${h.displayName}",${summary.totalHours.toFixed(1)},${summary.unitsEarned},${summary.unitsExpired},${summary.unitsUsed},${summary.unitsAvailable},${summary.hoursToNextUnit.toFixed(1)},"","","","","","",""`
      );
    } else {
      for (const a of apps) {
        rows.push(
          `"${h.displayName}",${summary.totalHours.toFixed(1)},${summary.unitsEarned},${summary.unitsExpired},${summary.unitsUsed},${summary.unitsAvailable},${summary.hoursToNextUnit.toFixed(1)},"${a.leaveDate}","${a.status}","${a.category ?? ""}","${a.halfDay ?? "FULL"}","${a.createdAt.toISOString().slice(0, 10)}","${a.reviewedAt ? a.reviewedAt.toISOString().slice(0, 10) : ""}","${(a.adminNote ?? "").replace(/"/g, '""')}"`
        );
      }
    }
  }

  const csv = rows.join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="replacement-leave-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
