import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildTopBottomSessions,
  type SessionRowSummary,
} from "@/lib/intelligence/aggregate";
import { analyzeLoaded, loadSessionsForScope } from "@/lib/intelligence/load";
import {
  parseDateRange,
  platformFilter,
  resolveAccessScope,
} from "@/lib/intelligence/scope";

interface BrandLite {
  id: string;
  name: string;
  color: string;
}

interface HostLite {
  id: string;
  displayName: string;
}

function enrich(
  row: SessionRowSummary,
  brandMap: Map<string, BrandLite>,
  hostMap: Map<string, HostLite>,
  campaignMap: Map<string, boolean>,
) {
  const brand = brandMap.get(row.brandId);
  const host = hostMap.get(row.liveHostId);
  return {
    sessionId: row.sessionId,
    tier: row.tier,
    funnelStage: row.funnelStage,
    platform: row.platform,
    gmv: row.gmv,
    gmvPerHour: row.gmvPerHour,
    durationHours: row.durationHours,
    viewers: row.viewers,
    ctor: row.ctor,
    isCampaignDay: campaignMap.get(row.sessionId) ?? row.isCampaignDay,
    brand: brand ? { name: brand.name, color: brand.color } : null,
    host: host ? { displayName: host.displayName } : null,
  };
}

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
  const tier = searchParams.get("tier");
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);

  const loaded = await loadSessionsForScope(scope, range, platform);
  const { rows } = await analyzeLoaded(loaded);
  const filteredRows = tier ? rows.filter((r) => r.result.tier === tier) : rows;

  const summaries: SessionRowSummary[] = filteredRows.map((r) => ({
    sessionId: r.result.sessionId,
    tier: r.result.tier,
    gmv: r.gmv,
    gmvPerHour: r.result.metrics.gmvPerHour,
    durationHours: r.durationHours,
    viewers: r.viewers,
    ctor: r.ctor,
    isCampaignDay: r.isCampaignDay,
    funnelStage: r.result.funnelStage,
    topFlag: r.result.driverFlags[0]?.metric ?? null,
    brandId: r.result.brandId,
    liveHostId: r.result.liveHostId,
    platform: r.result.platform,
  }));

  const brandIds = [...new Set(summaries.map((s) => s.brandId))];
  const hostIds = [...new Set(summaries.map((s) => s.liveHostId))];

  const [brands, hosts] = await Promise.all([
    prisma.brand.findMany({
      where: { id: { in: brandIds } },
      select: { id: true, name: true, color: true },
    }),
    prisma.liveHost.findMany({
      where: { id: { in: hostIds } },
      select: { id: true, displayName: true },
    }),
  ]);

  const brandMap = new Map(brands.map((b) => [b.id, b]));
  const hostMap = new Map(hosts.map((h) => [h.id, h]));
  const campaignMap = new Map(rows.map((r) => [r.result.sessionId, r.isCampaignDay]));

  const topBottom = buildTopBottomSessions(filteredRows);
  const list = summaries
    .slice(0, limit)
    .map((s) => enrich(s, brandMap, hostMap, campaignMap));

  return Response.json({
    sessions: list,
    topBottom: {
      top: topBottom.top.map((s) => enrich(s, brandMap, hostMap, campaignMap)),
      bottom: topBottom.bottom.map((s) =>
        enrich(s, brandMap, hostMap, campaignMap),
      ),
    },
  });
}
