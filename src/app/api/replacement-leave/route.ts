import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { createNotification } from "@/lib/tasks/notifications";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RLContribution {
  date: string;
  hours: number;
  reason: "OFF_DAY" | "EXTRA_HOURS" | "MANUAL";
  sessionId?: string;
  description: string;
  runningTotal: number;
}

export interface RLUnit {
  unitNumber: number;
  triggeredDate: string;
  expiresAt: string; // triggeredDate + 15 days
  isExpired: boolean;
}

export interface RLSummary {
  totalHours: number;
  hoursToNextUnit: number;
  unitsEarned: number;
  unitsExpired: number;
  unitsUsed: number;
  unitsPendingApproval: number;
  unitsAvailable: number;
  contributions: RLContribution[];
  units: RLUnit[];
}

// ── Shared utility ────────────────────────────────────────────────────────────

export function getLeaveTimeRange(leaveDate: string, halfDay?: string | null) {
  const dayStart = new Date(`${leaveDate}T00:00:00+08:00`);
  const dayEnd   = new Date(`${leaveDate}T23:59:59+08:00`);
  const noon     = new Date(`${leaveDate}T12:00:00+08:00`);
  return {
    start: halfDay === "AFTERNOON" ? noon : dayStart,
    end:   halfDay === "MORNING"   ? noon : dayEnd,
  };
}

// ── Core computation ──────────────────────────────────────────────────────────

export async function computeRLForHost(liveHostId: string): Promise<RLSummary> {
  const todayStr = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

  const [sessions, preference, adjustments, applications] = await Promise.all([
    prisma.session.findMany({
      where: { liveHostId, status: { not: "PENDING" } },
      select: { id: true, scheduledStart: true, scheduledEnd: true },
      orderBy: { scheduledStart: "asc" },
    }),
    prisma.hostPreference.findUnique({ where: { liveHostId }, select: { offDays: true } }),
    prisma.rLCreditAdjustment.findMany({ where: { liveHostId }, orderBy: { date: "asc" } }),
    prisma.rLApplication.findMany({ where: { liveHostId }, orderBy: { leaveDate: "asc" } }),
  ]);

  const offDays: string[] = preference?.offDays ? JSON.parse(preference.offDays) : [];

  const rawContribs: Omit<RLContribution, "runningTotal">[] = [];

  for (const s of sessions) {
    const startMs  = new Date(s.scheduledStart).getTime();
    const durationH = (new Date(s.scheduledEnd).getTime() - startMs) / 3_600_000;
    const mytDate  = new Date(startMs + 8 * 3_600_000).toISOString().slice(0, 10);

    if (offDays.includes(mytDate)) {
      rawContribs.push({ date: mytDate, hours: durationH, reason: "OFF_DAY", sessionId: s.id, description: `Off-day session (${durationH.toFixed(1)}h)` });
    } else if (durationH > 6) {
      const extra = durationH - 6;
      rawContribs.push({ date: mytDate, hours: extra, reason: "EXTRA_HOURS", sessionId: s.id, description: `Extra hours: +${extra.toFixed(1)}h beyond 6h standard` });
    }
  }

  for (const adj of adjustments) {
    rawContribs.push({ date: adj.date, hours: adj.hours, reason: "MANUAL", description: adj.reason });
  }

  rawContribs.sort((a, b) => a.date.localeCompare(b.date));

  let runningHours = 0;
  let prevUnitsEarned = 0;
  const units: RLUnit[] = [];
  const contributions: RLContribution[] = [];

  for (const c of rawContribs) {
    runningHours = Math.max(0, runningHours + c.hours);
    contributions.push({ ...c, runningTotal: runningHours });

    const newUnitsEarned = Math.floor(runningHours / 6);
    if (newUnitsEarned > prevUnitsEarned) {
      for (let i = prevUnitsEarned; i < newUnitsEarned; i++) {
        const exp = new Date(c.date + "T00:00:00Z");
        exp.setDate(exp.getDate() + 15);
        const expiresAt = exp.toISOString().slice(0, 10);
        units.push({ unitNumber: i + 1, triggeredDate: c.date, expiresAt, isExpired: expiresAt <= todayStr });
      }
      prevUnitsEarned = newUnitsEarned;
    }
  }

  const approved         = applications.filter(a => a.status === "APPROVED");
  const pending          = applications.filter(a => a.status === "PENDING");
  const unitsUsed        = approved.length;
  const unitsExpired     = units.filter(u => u.isExpired).length;
  const activeUnlocked   = units.filter(u => !u.isExpired).length;
  const unitsAvailable   = Math.max(0, activeUnlocked - unitsUsed);
  const hoursToNextUnit  = runningHours > 0 ? (6 - (runningHours % 6)) % 6 || 6 : 6;

  return {
    totalHours: runningHours,
    hoursToNextUnit,
    unitsEarned: units.length,
    unitsExpired,
    unitsUsed,
    unitsPendingApproval: pending.length,
    unitsAvailable,
    contributions,
    units,
  };
}

// ── GET: host fetches own summary ─────────────────────────────────────────────

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "LIVE_HOST") return Response.json({ error: "Forbidden" }, { status: 403 });

  const host = await prisma.liveHost.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!host) return Response.json({ error: "Host not found" }, { status: 404 });

  const [summary, applications] = await Promise.all([
    computeRLForHost(host.id),
    prisma.rLApplication.findMany({ where: { liveHostId: host.id }, orderBy: { createdAt: "desc" } }),
  ]);

  return Response.json({ summary, applications });
}

// ── POST: host applies for leave ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "LIVE_HOST") return Response.json({ error: "Forbidden" }, { status: 403 });

  const host = await prisma.liveHost.findUnique({ where: { userId: user.id }, select: { id: true, displayName: true } });
  if (!host) return Response.json({ error: "Host not found" }, { status: 404 });

  const { leaveDate, notes, halfDay, category } = await req.json();
  if (!leaveDate) return Response.json({ error: "leaveDate required" }, { status: 400 });

  // Minimum 3-day advance notice
  const minDate = new Date(Date.now() + 8 * 3_600_000 + 3 * 86_400_000).toISOString().slice(0, 10);
  if (leaveDate < minDate) {
    return Response.json({ error: `Leave must be applied at least 3 days in advance (earliest: ${minDate})` }, { status: 400 });
  }

  const [blackout, summary, existing] = await Promise.all([
    prisma.rLBlackoutDate.findFirst({ where: { date: leaveDate } }),
    computeRLForHost(host.id),
    prisma.rLApplication.findFirst({ where: { liveHostId: host.id, leaveDate, status: { in: ["PENDING", "APPROVED"] } } }),
  ]);

  if (blackout) return Response.json({ error: `${leaveDate} is a blackout date: ${blackout.reason}` }, { status: 400 });
  if (summary.unitsAvailable < 1) return Response.json({ error: "No available Replacement Leave units" }, { status: 400 });
  if (existing) return Response.json({ error: "You already have a leave application for this date" }, { status: 409 });

  const app = await prisma.rLApplication.create({
    data: { id: `rl_${Date.now()}`, liveHostId: host.id, leaveDate, notes: notes || null, halfDay: halfDay || null, category: category || null },
  });

  const detail = [leaveDate, halfDay ? `(${halfDay})` : "", category ? `[${category}]` : "", notes ? `— "${notes}"` : ""].filter(Boolean).join(" ");
  await Promise.all([
    prisma.rLAuditLog.create({ data: { id: `rla_${Date.now()}`, liveHostId: host.id, action: "APPLY", detail: `Applied for leave on ${detail}`, performedBy: user.id } }),
    prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } }).then(admins =>
      Promise.all(admins.map(a => createNotification({
        userId: a.id,
        type: "rl_apply",
        title: "New Leave Application",
        message: `${host.displayName} applied for Replacement Leave on ${leaveDate}${halfDay ? ` (${halfDay} day)` : ""}.`,
      })))
    ),
  ]);

  return Response.json({ ok: true, application: app });
}
