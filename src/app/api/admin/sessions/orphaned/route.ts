import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: count sessions with no liveHostId (and optionally no roomId)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const noRoom = req.nextUrl.searchParams.get("noRoom") === "true";
  const where = noRoom
    ? { liveHostId: null, roomId: null }
    : { liveHostId: null };

  const count = await prisma.session.count({ where });

  const sample = await prisma.session.findMany({
    where,
    select: {
      id: true, scheduledStart: true, scheduledEnd: true,
      brand: { select: { name: true } },
      room: { select: { name: true } },
    },
    take: 20,
    orderBy: { scheduledStart: "desc" },
  });

  return Response.json({ count, sample });
}

// DELETE: permanently remove sessions with no liveHostId and no roomId (true ghosts)
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const confirm = req.headers.get("x-confirm-delete-orphaned");
  if (confirm !== "yes-delete-all-orphaned")
    return Response.json({ error: "Missing confirmation header" }, { status: 400 });

  // Only delete true ghosts: no host AND no room — sessions with a room but
  // no host are valid admin-created brand-only slots visible in the schedule grid
  const { count } = await prisma.session.deleteMany({
    where: { liveHostId: null, roomId: null },
  });

  return Response.json({ ok: true, deleted: count });
}
