import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  const liveHostId = req.nextUrl.searchParams.get("liveHostId") ?? undefined;

  const logs = await prisma.rLAuditLog.findMany({
    where: liveHostId ? { liveHostId } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Enrich with performer names
  const performerIds = [...new Set(logs.map(l => l.performedBy))];
  const performers = await prisma.user.findMany({
    where: { id: { in: performerIds } },
    select: { id: true, name: true },
  });
  const performerMap = Object.fromEntries(performers.map(p => [p.id, p.name]));

  const hostIds = [...new Set(logs.map(l => l.liveHostId).filter(Boolean))] as string[];
  const hosts = await prisma.liveHost.findMany({
    where: { id: { in: hostIds } },
    select: { id: true, displayName: true },
  });
  const hostMap = Object.fromEntries(hosts.map(h => [h.id, h.displayName]));

  const enriched = logs.map(l => ({
    ...l,
    performerName: performerMap[l.performedBy] ?? l.performedBy,
    hostName: l.liveHostId ? (hostMap[l.liveHostId] ?? l.liveHostId) : null,
  }));

  return Response.json({ logs: enriched });
}
