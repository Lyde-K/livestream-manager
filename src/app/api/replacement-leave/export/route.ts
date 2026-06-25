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

  // Fetch all data in parallel
  const [summaries, allApps] = await Promise.all([
    Promise.all(hosts.map(h => computeRLForHost(h.id))),
    prisma.rLApplication.findMany({
      where: { liveHostId: { in: hosts.map(h => h.id) } },
      orderBy: { leaveDate: "asc" },
    }),
  ]);

  const appsByHost = new Map<string, typeof allApps>();
  for (const a of allApps) {
    if (!appsByHost.has(a.liveHostId)) appsByHost.set(a.liveHostId, []);
    appsByHost.get(a.liveHostId)!.push(a);
  }

  const rows: string[] = [
    "Host,Total Hours,Units Earned,Units Expired,Units Used,Units Available,Hours To Next Unit,Leave Date,Status,Category,Half Day,Applied At,Reviewed At,Admin Note",
  ];

  for (let i = 0; i < hosts.length; i++) {
    const h = hosts[i];
    const s = summaries[i];
    const apps = appsByHost.get(h.id) ?? [];

    const base = `"${h.displayName}",${s.totalHours.toFixed(1)},${s.unitsEarned},${s.unitsExpired},${s.unitsUsed},${s.unitsAvailable},${s.hoursToNextUnit.toFixed(1)}`;

    if (apps.length === 0) {
      rows.push(`${base},"","","","","","",""`);
    } else {
      for (const a of apps) {
        rows.push(`${base},"${a.leaveDate}","${a.status}","${a.category ?? ""}","${a.halfDay ?? "Full Day"}","${a.createdAt.toISOString().slice(0, 10)}","${a.reviewedAt ? a.reviewedAt.toISOString().slice(0, 10) : ""}","${(a.adminNote ?? "").replace(/"/g, '""')}"`);
      }
    }
  }

  return new Response(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="replacement-leave-${new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)}.csv"`,
    },
  });
}
