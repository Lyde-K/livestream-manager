import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { computeRLForHost } from "../route";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  const [hosts, pendingApps, recentApprovedApps] = await Promise.all([
    prisma.liveHost.findMany({
      where: { isActive: true },
      select: { id: true, displayName: true, user: { select: { name: true } } },
      orderBy: { displayName: "asc" },
    }),
    prisma.rLApplication.findMany({
      where: { status: "PENDING" },
      include: { liveHost: { select: { id: true, displayName: true, user: { select: { name: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.rLApplication.findMany({
      where: { status: { in: ["APPROVED", "REJECTED"] } },
      include: { liveHost: { select: { id: true, displayName: true } } },
      orderBy: { leaveDate: "desc" },
      take: 200,
    }),
  ]);

  const summaries = await Promise.all(
    hosts.map(async (h) => ({
      host: h,
      summary: await computeRLForHost(h.id),
    }))
  );

  return Response.json({ summaries, pendingApps, recentApprovedApps });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();

  // Balance override: compute delta and create adjustment
  if (body.action === "SET_BALANCE") {
    const { liveHostId, targetUnits, reason } = body;
    if (!liveHostId || targetUnits === undefined || !reason) {
      return Response.json({ error: "liveHostId, targetUnits, reason required" }, { status: 400 });
    }
    const summary = await computeRLForHost(liveHostId);
    const targetHours = Number(targetUnits) * 6;
    const deltaHours = targetHours - summary.totalHours;
    const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
    const adj = await prisma.rLCreditAdjustment.create({
      data: {
        id: `rladj_${Date.now()}`,
        liveHostId,
        date: today,
        hours: deltaHours,
        reason: `[Balance Override] ${reason}`,
        addedBy: user.id,
      },
    });
    await prisma.rLAuditLog.create({
      data: {
        id: `rla_${Date.now()}`,
        liveHostId,
        action: "BALANCE_OVERRIDE",
        detail: `Balance set to ${targetUnits} units (${deltaHours >= 0 ? "+" : ""}${deltaHours.toFixed(1)}h adjustment). Reason: ${reason}`,
        performedBy: user.id,
      },
    });
    return Response.json({ ok: true, adjustment: adj });
  }

  // Regular manual credit
  const { liveHostId, date, hours, reason } = body;
  if (!liveHostId || !date || hours === undefined || !reason) {
    return Response.json({ error: "liveHostId, date, hours, reason required" }, { status: 400 });
  }

  const adj = await prisma.rLCreditAdjustment.create({
    data: { id: `rladj_${Date.now()}`, liveHostId, date, hours: Number(hours), reason, addedBy: user.id },
  });

  await prisma.rLAuditLog.create({
    data: {
      id: `rla_${Date.now()}`,
      liveHostId,
      action: "MANUAL_CREDIT",
      detail: `Manual ${Number(hours) >= 0 ? "credit" : "deduction"} of ${Math.abs(Number(hours))}h on ${date}. Reason: ${reason}`,
      performedBy: user.id,
    },
  });

  return Response.json({ ok: true, adjustment: adj });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const adj = await prisma.rLCreditAdjustment.findUnique({ where: { id } });
  if (!adj) return Response.json({ error: "Not found" }, { status: 404 });

  await prisma.rLCreditAdjustment.delete({ where: { id } });

  await prisma.rLAuditLog.create({
    data: {
      id: `rla_${Date.now()}`,
      liveHostId: adj.liveHostId,
      action: "REMOVE_CREDIT",
      detail: `Removed manual adjustment of ${adj.hours}h from ${adj.date}. Original reason: ${adj.reason}`,
      performedBy: user.id,
    },
  });

  return Response.json({ ok: true });
}
