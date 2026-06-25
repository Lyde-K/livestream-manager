import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { createNotification } from "@/lib/tasks/notifications";
import { getLeaveTimeRange } from "../route";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  const { ids, action, adminNote } = await req.json();
  if (!ids?.length || !action) return Response.json({ error: "ids and action required" }, { status: 400 });

  const apps = await prisma.rLApplication.findMany({
    where: { id: { in: ids }, status: "PENDING" },
    include: { liveHost: { select: { id: true, displayName: true, userId: true } } },
  });

  const note = adminNote || null;
  const results: { id: string; ok: boolean; removed?: number }[] = [];

  for (const app of apps) {
    const auditId = `rla_${Date.now()}_${app.id}`;

    if (action === "APPROVE") {
      const { start, end } = getLeaveTimeRange(app.leaveDate, app.halfDay);
      const removed = await prisma.session.deleteMany({
        where: { liveHostId: app.liveHostId, status: "PENDING", scheduledStart: { gte: start, lte: end } },
      });

      await Promise.all([
        prisma.rLApplication.update({
          where: { id: app.id },
          data: { status: "APPROVED", adminNote: note, reviewedBy: user.id, reviewedAt: new Date() },
        }),
        prisma.rLAuditLog.create({ data: {
          id: auditId,
          liveHostId: app.liveHostId,
          action: "APPROVE",
          detail: `[Bulk] Approved leave on ${app.leaveDate}. Removed ${removed.count} session(s).${note ? ` Note: "${note}"` : ""}`,
          performedBy: user.id,
        }}),
        createNotification({
          userId: app.liveHost.userId,
          type: "rl_approved",
          title: "Leave Approved",
          message: `Your Replacement Leave on ${app.leaveDate} has been approved.${note ? ` Admin note: "${note}"` : ""}`,
        }),
      ]);

      results.push({ id: app.id, ok: true, removed: removed.count });
    } else {
      await Promise.all([
        prisma.rLApplication.update({
          where: { id: app.id },
          data: { status: "REJECTED", adminNote: note, reviewedBy: user.id, reviewedAt: new Date() },
        }),
        prisma.rLAuditLog.create({ data: {
          id: auditId,
          liveHostId: app.liveHostId,
          action: "REJECT",
          detail: `[Bulk] Rejected leave on ${app.leaveDate}.${note ? ` Note: "${note}"` : ""}`,
          performedBy: user.id,
        }}),
        createNotification({
          userId: app.liveHost.userId,
          type: "rl_rejected",
          title: "Leave Rejected",
          message: `Your Replacement Leave on ${app.leaveDate} was not approved.${note ? ` Reason: "${note}"` : ""}`,
        }),
      ]);

      results.push({ id: app.id, ok: true });
    }
  }

  return Response.json({ ok: true, results });
}
