import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface BulkSession {
  liveHostId: string;
  brandId: string;
  roomId: string;
  platform: string;
  scheduledStart: string;
  scheduledEnd: string;
  isCampaignDay: boolean;
  notes: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { role: string };
  if (user.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  const { sessions } = (await req.json()) as { sessions: BulkSession[] };
  if (!sessions || sessions.length === 0)
    return Response.json({ error: "No sessions provided" }, { status: 400 });

  const created = await prisma.session.createMany({
    data: sessions.map((s) => ({
      liveHostId: s.liveHostId,
      brandId: s.brandId,
      roomId: s.roomId,
      platform: s.platform,
      scheduledStart: new Date(s.scheduledStart),
      scheduledEnd: new Date(s.scheduledEnd),
      isCampaignDay: s.isCampaignDay,
      notes: s.notes || null,
      status: "PENDING",
    })),
  });

  return Response.json({ created: created.count });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { role: string };
  if (user.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  const { start, end, brandId } = await req.json() as { start: string; end: string; brandId?: string | null };
  if (!start || !end) return Response.json({ error: "start and end required" }, { status: 400 });

  const deleted = await prisma.session.deleteMany({
    where: {
      scheduledStart: { gte: new Date(start), lte: new Date(end) },
      ...(brandId ? { brandId } : {}),
    },
  });

  return Response.json({ deleted: deleted.count });
}
