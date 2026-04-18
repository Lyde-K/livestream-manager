import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const data = await req.json();
  const updated = await prisma.session.update({
    where: { id },
    data: {
      roomId: data.roomId,
      liveHostId: data.liveHostId,
      brandId: data.brandId,
      platform: data.platform,
      scheduledStart: new Date(data.scheduledStart),
      scheduledEnd: new Date(data.scheduledEnd),
      isCampaignDay: data.isCampaignDay,
      notes: data.notes,
    },
    include: { room: true, brand: true, liveHost: { include: { user: true } } },
  });
  return Response.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await prisma.session.delete({ where: { id } });
  return Response.json({ ok: true });
}
