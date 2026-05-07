import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import {
  buildActionPriorities,
  buildKeyInsights,
} from "@/lib/intelligence/aggregate";
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
  const { results } = await analyzeLoaded(loaded);

  return Response.json({
    keyInsights: buildKeyInsights(results),
    actionPriorities: buildActionPriorities(results),
  });
}
