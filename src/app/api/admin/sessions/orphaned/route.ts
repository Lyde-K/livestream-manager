import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: count sessions with no liveHostId
export async function GET() {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const count = await prisma.session.count({
    where: { liveHostId: null },
  });

  const sample = await prisma.session.findMany({
    where: { liveHostId: null },
    select: {
      id: true, scheduledStart: true, scheduledEnd: true,
      brand: { select: { name: true } },
      room: { select: { name: true } },
    },
    take: 10,
    orderBy: { scheduledStart: "desc" },
  });

  return Response.json({ count, sample });
}

// DELETE: permanently remove all sessions with no liveHostId
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const confirm = req.headers.get("x-confirm-delete-orphaned");
  if (confirm !== "yes-delete-all-orphaned")
    return Response.json({ error: "Missing confirmation header" }, { status: 400 });

  const { count } = await prisma.session.deleteMany({
    where: { liveHostId: null },
  });

  return Response.json({ ok: true, deleted: count });
}
