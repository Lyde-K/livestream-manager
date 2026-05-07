import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildHostLeaderboard } from "@/lib/intelligence/aggregate";
import { analyzeLoaded, loadSessionsForScope } from "@/lib/intelligence/load";
import {
  parseDateRange,
  platformFilter,
  resolveAccessScope,
} from "@/lib/intelligence/scope";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  const { searchParams } = new URL(req.url);
  const scope = await resolveAccessScope(user.id, user.role, {
    brandId: searchParams.get("brandId"),
    hostId: searchParams.get("hostId"),
  });
  const range = parseDateRange(searchParams);
  const platform = platformFilter(searchParams);

  const loaded = await loadSessionsForScope(scope, range, platform);
  const { rows } = await analyzeLoaded(loaded);
  const leaderboard = buildHostLeaderboard(rows);

  const hosts = await prisma.liveHost.findMany({
    where: { id: { in: leaderboard.map((l) => l.liveHostId) } },
    select: { id: true, displayName: true, type: true },
  });
  const hostMap = new Map(hosts.map((h) => [h.id, h]));

  return Response.json({
    hosts: leaderboard.map((l) => ({
      ...l,
      displayName: hostMap.get(l.liveHostId)?.displayName ?? "Unknown",
      type: hostMap.get(l.liveHostId)?.type ?? "FULL_TIME",
    })),
  });
}
