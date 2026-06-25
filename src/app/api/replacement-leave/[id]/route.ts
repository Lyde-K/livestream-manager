import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

// PATCH: admin approves or rejects an RL application
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { action, adminNote } = await req.json(); // action: "APPROVE" | "REJECT"

  const app = await prisma.rLApplication.findUnique({ where: { id } });
  if (!app) return Response.json({ error: "Not found" }, { status: 404 });
  if (app.status !== "PENDING") return Response.json({ error: "Application is not pending" }, { status: 409 });

  if (action === "APPROVE") {
    // Remove all PENDING sessions for this host on this date (MYT)
    // leaveDate is "YYYY-MM-DD" in MYT — find sessions whose MYT date matches
    const dayStart = new Date(`${app.leaveDate}T00:00:00+08:00`);
    const dayEnd = new Date(`${app.leaveDate}T23:59:59+08:00`);

    const removedSessions = await prisma.session.findMany({
      where: {
        liveHostId: app.liveHostId,
        status: "PENDING",
        scheduledStart: { gte: dayStart, lte: dayEnd },
      },
      select: { id: true, brand: { select: { name: true } }, scheduledStart: true, scheduledEnd: true },
    });

    await prisma.session.deleteMany({
      where: {
        liveHostId: app.liveHostId,
        status: "PENDING",
        scheduledStart: { gte: dayStart, lte: dayEnd },
      },
    });

    const updated = await prisma.rLApplication.update({
      where: { id },
      data: {
        status: "APPROVED",
        adminNote: adminNote || null,
        reviewedBy: user.id,
        reviewedAt: new Date(),
      },
    });

    return Response.json({ ok: true, application: updated, removedSessions });
  }

  if (action === "REJECT") {
    const updated = await prisma.rLApplication.update({
      where: { id },
      data: {
        status: "REJECTED",
        adminNote: adminNote || null,
        reviewedBy: user.id,
        reviewedAt: new Date(),
      },
    });
    return Response.json({ ok: true, application: updated });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}

// DELETE: admin cancels an application (or host cancels their own pending)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };

  const { id } = await params;
  const app = await prisma.rLApplication.findUnique({
    where: { id },
    include: { liveHost: { select: { userId: true } } },
  });
  if (!app) return Response.json({ error: "Not found" }, { status: 404 });

  // Host can only cancel their own PENDING applications
  if (user.role === "LIVE_HOST" && (app.liveHost.userId !== user.id || app.status !== "PENDING")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.rLApplication.delete({ where: { id } });
  return Response.json({ ok: true });
}
