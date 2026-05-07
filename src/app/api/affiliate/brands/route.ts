import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAffiliateScope } from "@/lib/affiliate/scope";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  const scope = await getAffiliateScope(user);

  const brands = await prisma.brand.findMany({
    where: { id: { in: scope.brandIds }, isActive: true },
    select: { id: true, name: true, color: true, client: { select: { user: { select: { name: true } } } } },
    orderBy: { name: "asc" },
  });
  return Response.json({ brands, isAdmin: scope.isAdmin });
}
