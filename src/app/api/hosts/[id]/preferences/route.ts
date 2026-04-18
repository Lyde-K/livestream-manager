import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const pref = await prisma.hostPreference.findUnique({ where: { liveHostId: id } });
  if (!pref) {
    return Response.json({ liveHostId: id, preferredSlots: [], preferredBrands: [], offDays: [] });
  }
  return Response.json({
    liveHostId: pref.liveHostId,
    preferredSlots: JSON.parse(pref.preferredSlots),
    preferredBrands: JSON.parse(pref.preferredBrands),
    offDays: JSON.parse(pref.offDays),
  });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  const { id } = await params;

  // LIVE_HOST can only edit own preferences
  if (user.role === "LIVE_HOST") {
    const host = await prisma.liveHost.findUnique({ where: { userId: user.id } });
    if (!host || host.id !== id) return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { preferredSlots, preferredBrands, offDays } = await req.json();

  const pref = await prisma.hostPreference.upsert({
    where: { liveHostId: id },
    update: {
      preferredSlots: JSON.stringify(preferredSlots ?? []),
      preferredBrands: JSON.stringify(preferredBrands ?? []),
      offDays: JSON.stringify(offDays ?? []),
    },
    create: {
      liveHostId: id,
      preferredSlots: JSON.stringify(preferredSlots ?? []),
      preferredBrands: JSON.stringify(preferredBrands ?? []),
      offDays: JSON.stringify(offDays ?? []),
    },
  });

  return Response.json({
    liveHostId: pref.liveHostId,
    preferredSlots: JSON.parse(pref.preferredSlots),
    preferredBrands: JSON.parse(pref.preferredBrands),
    offDays: JSON.parse(pref.offDays),
  });
}
