import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildBrandInsights } from "@/lib/intelligence/aggregate";
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
  const insights = buildBrandInsights(rows);

  const brandIds = insights.map((i) => i.brandId);
  const hostIds = insights
    .map((i) => i.topHostId)
    .filter((id): id is string => id !== null);

  const [brands, hosts] = await Promise.all([
    prisma.brand.findMany({
      where: { id: { in: brandIds } },
      select: { id: true, name: true, color: true, platform: true },
    }),
    prisma.liveHost.findMany({
      where: { id: { in: hostIds } },
      select: { id: true, displayName: true },
    }),
  ]);

  const brandMap = new Map(brands.map((b) => [b.id, b]));
  const hostMap = new Map(hosts.map((h) => [h.id, h]));

  return Response.json({
    brands: insights.map((i) => ({
      ...i,
      name: brandMap.get(i.brandId)?.name ?? "Unknown",
      color: brandMap.get(i.brandId)?.color ?? "#6366f1",
      platform: brandMap.get(i.brandId)?.platform ?? "BOTH",
      topHostName: i.topHostId ? hostMap.get(i.topHostId)?.displayName ?? null : null,
    })),
  });
}
