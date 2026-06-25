import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { createNotification } from "@/lib/tasks/notifications";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { action, adminNote } = await req.json(); // action: "APPROVE" | "REJECT"

  const app = await prisma.rLApplication.findUnique({
    where: { id },
    include: { liveHost: { select: { id: true, displayName: true, userId: true } } },
  });
  if (!app) return Response.json({ error: "Not found" }, { status: 404 });
  if (app.status !== "PENDING") return Response.json({ error: "Application is not pending" }, { status: 409 });

  if (action === "APPROVE") {
    const dayStart = new Date(`${app.leaveDate}T00:00:00+08:00`);
    const dayEnd = new Date(`${app.leaveDate}T23:59:59+08:00`);

    // Narrow to half-day if applicable
    const start = app.halfDay === "AFTERNOON"
      ? new Date(`${app.leaveDate}T12:00:00+08:00`)
      : dayStart;
    const end = app.halfDay === "MORNING"
      ? new Date(`${app.leaveDate}T12:00:00+08:00`)
      : dayEnd;

    const removedSessions = await prisma.session.findMany({
      where: {
        liveHostId: app.liveHostId,
        status: "PENDING",
        scheduledStart: { gte: start, lte: end },
      },
      select: { id: true, brand: { select: { name: true } }, scheduledStart: true, scheduledEnd: true },
    });

    await prisma.session.deleteMany({
      where: {
        liveHostId: app.liveHostId,
        status: "PENDING",
        scheduledStart: { gte: start, lte: end },
      },
    });

    const updated = await prisma.rLApplication.update({
      where: { id },
      data: { status: "APPROVED", adminNote: adminNote || null, reviewedBy: user.id, reviewedAt: new Date() },
    });

    // Audit log
    await prisma.rLAuditLog.create({
      data: {
        id: `rla_${Date.now()}`,
        liveHostId: app.liveHostId,
        action: "APPROVE",
        detail: `Approved leave on ${app.leaveDate}. Removed ${removedSessions.length} session(s).${adminNote ? ` Note: "${adminNote}"` : ""}`,
        performedBy: user.id,
      },
    });

    // Notify host
    await createNotification({
      userId: app.liveHost.userId,
      type: "rl_approved",
      title: "Leave Approved",
      message: `Your Replacement Leave on ${app.leaveDate}${app.halfDay ? ` (${app.halfDay})` : ""} has been approved.${adminNote ? ` Admin note: "${adminNote}"` : ""}`,
    });

    return Response.json({ ok: true, application: updated, removedSessions });
  }

  if (action === "REJECT") {
    const updated = await prisma.rLApplication.update({
      where: { id },
      data: { status: "REJECTED", adminNote: adminNote || null, reviewedBy: user.id, reviewedAt: new Date() },
    });

    // Audit log
    await prisma.rLAuditLog.create({
      data: {
        id: `rla_${Date.now() + 1}`,
        liveHostId: app.liveHostId,
        action: "REJECT",
        detail: `Rejected leave on ${app.leaveDate}.${adminNote ? ` Note: "${adminNote}"` : ""}`,
        performedBy: user.id,
      },
    });

    // Notify host
    await createNotification({
      userId: app.liveHost.userId,
      type: "rl_rejected",
      title: "Leave Rejected",
      message: `Your Replacement Leave on ${app.leaveDate} was not approved.${adminNote ? ` Reason: "${adminNote}"` : ""}`,
    });

    return Response.json({ ok: true, application: updated });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };

  const { id } = await params;
  const app = await prisma.rLApplication.findUnique({
    where: { id },
    include: { liveHost: { select: { userId: true, id: true, displayName: true } } },
  });
  if (!app) return Response.json({ error: "Not found" }, { status: 404 });

  if (user.role === "LIVE_HOST" && (app.liveHost.userId !== user.id || app.status !== "PENDING")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.rLApplication.delete({ where: { id } });

  await prisma.rLAuditLog.create({
    data: {
      id: `rla_${Date.now()}`,
      liveHostId: app.liveHostId,
      action: "CANCEL",
      detail: `Cancelled leave application for ${app.leaveDate} (was ${app.status}).`,
      performedBy: user.id,
    },
  });

  return Response.json({ ok: true });
}
