import { prisma } from "@/lib/prisma";

export type Role = "ADMIN" | "LIVE_HOST" | "CLIENT";

export interface AccessScope {
  role: Role;
  brandIds: string[] | null; // null = unrestricted
  liveHostId: string | null; // non-null for LIVE_HOST only
}

export async function resolveAccessScope(
  userId: string,
  role: string,
  query: { brandId?: string | null; hostId?: string | null },
): Promise<AccessScope> {
  if (role === "LIVE_HOST") {
    const host = await prisma.liveHost.findUnique({ where: { userId } });
    return {
      role: "LIVE_HOST",
      brandIds: null,
      liveHostId: host?.id ?? null,
    };
  }

  if (role === "CLIENT") {
    const client = await prisma.client.findUnique({
      where: { userId },
      include: { brands: { select: { id: true } } },
    });
    const ownBrandIds = client?.brands.map((b) => b.id) ?? [];
    const requestedBrand = query.brandId;
    const filtered = requestedBrand
      ? ownBrandIds.filter((id) => id === requestedBrand)
      : ownBrandIds;
    return {
      role: "CLIENT",
      brandIds: filtered,
      liveHostId: null,
    };
  }

  // ADMIN
  return {
    role: "ADMIN",
    brandIds: query.brandId ? [query.brandId] : null,
    liveHostId: query.hostId ?? null,
  };
}

export interface DateRange {
  from: Date;
  to: Date;
}

export function parseDateRange(searchParams: URLSearchParams): DateRange {
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = fromParam ? new Date(fromParam) : defaultFrom;
  const to = toParam ? new Date(toParam) : now;
  return { from, to };
}

export function platformFilter(searchParams: URLSearchParams):
  | "TIKTOK"
  | "SHOPEE"
  | undefined {
  const p = searchParams.get("platform");
  if (p === "TIKTOK" || p === "SHOPEE") return p;
  return undefined;
}
