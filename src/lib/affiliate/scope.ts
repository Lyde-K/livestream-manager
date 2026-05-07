import { prisma } from "@/lib/prisma";

export interface ScopedAccess {
  isAdmin: boolean;
  brandIds: string[];
}

interface SessionUser {
  id: string;
  role: string;
}

export async function getAffiliateScope(user: SessionUser): Promise<ScopedAccess> {
  if (user.role === "ADMIN") {
    const all = await prisma.brand.findMany({
      where: { hasAffiliate: true },
      select: { id: true },
    });
    return { isAdmin: true, brandIds: all.map((b) => b.id) };
  }
  if (user.role === "CLIENT") {
    const client = await prisma.client.findUnique({
      where: { userId: user.id },
      include: { brands: { where: { hasAffiliate: true }, select: { id: true } } },
    });
    return { isAdmin: false, brandIds: (client?.brands ?? []).map((b) => b.id) };
  }
  return { isAdmin: false, brandIds: [] };
}

export function assertBrandAccess(scope: ScopedAccess, brandId: string): boolean {
  return scope.brandIds.includes(brandId);
}
