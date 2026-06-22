import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAffiliateScope, assertBrandAccess } from "@/lib/affiliate/scope";
import { cachedJson } from "@/lib/affiliate/cache";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  const scope = await getAffiliateScope(user);

  const brandId = req.nextUrl.searchParams.get("brandId");
  const where = brandId
    ? assertBrandAccess(scope, brandId)
      ? { brandId }
      : null
    : { brandId: { in: scope.brandIds } };
  if (!where) return Response.json({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.affiliateCreatorStat.findMany({
    where,
    select: { period: true },
    distinct: ["period"],
    orderBy: { period: "desc" },
  });
  const periods = rows.map((r) => r.period);
  return cachedJson({ periods }, 60);
}
