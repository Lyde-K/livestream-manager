import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// preferredSlots field stores { normal: string[], campaign: string[] }
// Legacy format was a flat string[] — handle gracefully.
function parseSlots(raw: string): { normalSlots: string[]; campaignSlots: string[] } {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Legacy flat array → treat as normalSlots, no campaign slots
      return { normalSlots: parsed, campaignSlots: [] };
    }
    return {
      normalSlots: Array.isArray(parsed.normal) ? parsed.normal : [],
      campaignSlots: Array.isArray(parsed.campaign) ? parsed.campaign : [],
    };
  } catch {
    return { normalSlots: [], campaignSlots: [] };
  }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const pref = await prisma.hostPreference.findUnique({ where: { liveHostId: id } });
  if (!pref) {
    return Response.json({ liveHostId: id, normalSlots: [], campaignSlots: [], preferredBrands: [], offDays: [] });
  }
  const { normalSlots, campaignSlots } = parseSlots(pref.preferredSlots);
  return Response.json({
    liveHostId: pref.liveHostId,
    normalSlots,
    campaignSlots,
    preferredBrands: JSON.parse(pref.preferredBrands),
    offDays: JSON.parse(pref.offDays),
  });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };
  const { id } = await params;

  if (user.role === "LIVE_HOST") {
    const host = await prisma.liveHost.findUnique({ where: { userId: user.id } });
    if (!host || host.id !== id) return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { normalSlots, campaignSlots, preferredBrands, offDays } = await req.json();

  const slotsJson = JSON.stringify({
    normal: normalSlots ?? [],
    campaign: campaignSlots ?? [],
  });

  const pref = await prisma.hostPreference.upsert({
    where: { liveHostId: id },
    update: {
      preferredSlots: slotsJson,
      preferredBrands: JSON.stringify(preferredBrands ?? []),
      offDays: JSON.stringify(offDays ?? []),
    },
    create: {
      liveHostId: id,
      preferredSlots: slotsJson,
      preferredBrands: JSON.stringify(preferredBrands ?? []),
      offDays: JSON.stringify(offDays ?? []),
    },
  });

  const parsed = parseSlots(pref.preferredSlots);
  return Response.json({
    liveHostId: pref.liveHostId,
    normalSlots: parsed.normalSlots,
    campaignSlots: parsed.campaignSlots,
    preferredBrands: JSON.parse(pref.preferredBrands),
    offDays: JSON.parse(pref.offDays),
  });
}
