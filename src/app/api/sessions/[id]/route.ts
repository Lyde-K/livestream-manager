import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const { roomId, liveHostId, brandId, platform, scheduledStart, scheduledEnd, isCampaignDay, notes, slotColor } = await req.json();
  const updated = await prisma.session.update({
    where: { id },
    data: {
      // Allow explicit null to unset host/room, or a value to set it
      liveHostId: liveHostId ?? null,
      roomId: roomId ?? null,
      brandId,
      platform,
      scheduledStart: new Date(scheduledStart),
      scheduledEnd: new Date(scheduledEnd),
      isCampaignDay,
      notes: notes ?? null,
      ...(slotColor !== undefined ? { slotColor } : {}),
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
