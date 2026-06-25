import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { createNotification } from "@/lib/tasks/notifications";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  const { ids, action, adminNote } = await req.json(); // action: "APPROVE" | "REJECT"
  if (!ids?.length || !action) return Response.json({ error: "ids and action required" }, { status: 400 });

  const apps = await prisma.rLApplication.findMany({
    where: { id: { in: ids }, status: "PENDING" },
    include: { liveHost: { select: { id: true, displayName: true, userId: true } } },
  });

  const results: { id: string; ok: boolean; removed?: number }[] = [];

  for (const app of apps) {
    if (action === "APPROVE") {
      const dayStart = new Date(`${app.leaveDate}T00:00:00+08:00`);
      const dayEnd = new Date(`${app.leaveDate}T23:59:59+08:00`);
      const start = app.halfDay === "AFTERNOON" ? new Date(`${app.leaveDate}T12:00:00+08:00`) : dayStart;
      const end = app.halfDay === "MORNING" ? new Date(`${app.leaveDate}T12:00:00+08:00`) : dayEnd;

      const removed = await prisma.session.deleteMany({
        where: { liveHostId: app.liveHostId, status: "PENDING", scheduledStart: { gte: start, lte: end } },
      });

      await prisma.rLApplication.update({
        where: { id: app.id },
        data: { status: "APPROVED", adminNote: adminNote || null, reviewedBy: user.id, reviewedAt: new Date() },
      });

      await prisma.rLAuditLog.create({
        data: {
          id: `rla_${Date.now()}_${app.id}`,
          liveHostId: app.liveHostId,
          action: "APPROVE",
          detail: `[Bulk] Approved leave on ${app.leaveDate}. Removed ${removed.count} session(s).`,
          performedBy: user.id,
        },
      });

      await createNotification({
        userId: app.liveHost.userId,
        type: "rl_approved",
        title: "Leave Approved",
        message: `Your Replacement Leave on ${app.leaveDate} has been approved.${adminNote ? ` Admin note: "${adminNote}"` : ""}`,
      });

      results.push({ id: app.id, ok: true, removed: removed.count });
    } else {
      await prisma.rLApplication.update({
        where: { id: app.id },
        data: { status: "REJECTED", adminNote: adminNote || null, reviewedBy: user.id, reviewedAt: new Date() },
      });

      await prisma.rLAuditLog.create({
        data: {
          id: `rla_${Date.now()}_${app.id}`,
          liveHostId: app.liveHostId,
          action: "REJECT",
          detail: `[Bulk] Rejected leave on ${app.leaveDate}.${adminNote ? ` Note: "${adminNote}"` : ""}`,
          performedBy: user.id,
        },
      });

      await createNotification({
        userId: app.liveHost.userId,
        type: "rl_rejected",
        title: "Leave Rejected",
        message: `Your Replacement Leave on ${app.leaveDate} was not approved.${adminNote ? ` Reason: "${adminNote}"` : ""}`,
      });

      results.push({ id: app.id, ok: true });
    }
  }

  return Response.json({ ok: true, results });
}
