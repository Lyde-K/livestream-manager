import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeConfigVersion } from "@/lib/intelligence/config";
import type { IntelligenceConfigResolved } from "@/lib/intelligence/types";
import { validateConfigBody } from "../../route";

interface RouteContext {
  params: Promise<{ brandId: string }>;
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const session = await auth();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { brandId } = await ctx.params;
  const body = (await req.json()) as Partial<IntelligenceConfigResolved>;

  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) return Response.json({ error: "Brand not found" }, { status: 404 });

  const validated = validateConfigBody(body);
  if ("error" in validated) {
    return Response.json({ error: validated.error }, { status: 400 });
  }

  const version = computeConfigVersion(validated);

  const data = {
    ...validated,
    enabledMetrics: validated.enabledMetrics as unknown as object,
    configVersion: version,
    updatedBy: user.id,
  };

  const upserted = await prisma.intelligenceConfig.upsert({
    where: { scope_brandId: { scope: "BRAND", brandId } },
    create: { ...data, scope: "BRAND", brandId },
    update: data,
  });

  return Response.json({ ok: true, configVersion: upserted.configVersion });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const session = await auth();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { role: string };
  if (user.role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { brandId } = await ctx.params;
  await prisma.intelligenceConfig.deleteMany({
    where: { scope: "BRAND", brandId },
  });
  return Response.json({ ok: true });
}
