import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { name, platform, startDate, endDate, brandId, notes } = await req.json();
  const start = new Date(startDate);
  const end   = new Date(endDate);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campaign = await (prisma as any).campaign.update({
    where: { id },
    data: {
      name, platform,
      startDate: start,
      endDate:   end,
      month: start.getMonth() + 1,
      year:  start.getFullYear(),
      brandId: brandId || null,
      notes: notes || null,
      updatedAt: new Date(),
    },
    include: { brand: { select: { id: true, name: true, color: true } } },
  });
  return Response.json(campaign);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma as any).campaign.delete({ where: { id } });
  return Response.json({ ok: true });
}
