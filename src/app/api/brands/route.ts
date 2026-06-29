import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const where: Record<string, unknown> = {};
  if (searchParams.get("hasLivestream") === "1") where.hasLivestream = true;
  if (searchParams.get("hasAffiliate") === "1") where.hasAffiliate = true;
  const brands = await prisma.brand.findMany({
    where,
    include: { client: { include: { user: true } } },
    orderBy: { name: "asc" },
  });
  return Response.json(brands, {
    headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });
  const { name, platform, color, clientId, hasLivestream, hasAffiliate } = await req.json();
  const brand = await prisma.brand.create({
    data: {
      name,
      platform,
      color: color || "#6366f1",
      clientId: clientId || null,
      hasLivestream: hasLivestream ?? true,
      hasAffiliate: hasAffiliate ?? false,
    },
  });
  return Response.json(brand, { status: 201 });
}
