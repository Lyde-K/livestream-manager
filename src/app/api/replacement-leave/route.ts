import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { createNotification } from "@/lib/tasks/notifications";

// ── Shared RL computation logic ───────────────────────────────────────────────

export interface RLContribution {
  date: string;        // YYYY-MM-DD
  hours: number;
  reason: "OFF_DAY" | "EXTRA_HOURS" | "MANUAL";
  sessionId?: string;
  description: string;
  runningTotal: number;
}

export interface RLUnit {
  unitNumber: number;
  triggeredDate: string; // date the 6th hour was accumulated
  unlockDate: string;    // triggeredDate + 15 days
  expiresAt: string;     // unlockDate + 15 days (unit expires if not used)
  isUnlocked: boolean;
  isExpired: boolean;
}

export interface RLSummary {
  totalHours: number;
  unitsEarned: number;
  unitsExpired: number;
  unitsUsed: number;
  unitsPendingApproval: number;
  unitsAvailable: number;   // unlocked, not expired, not used
  unitsPendingUnlock: number;
  hoursToNextUnit: number;  // hours needed to reach the next 6h boundary
  contributions: RLContribution[];
  units: RLUnit[];
}

export async function computeRLForHost(liveHostId: string): Promise<RLSummary> {
  const todayStr = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

  const [sessions, preference, adjustments, applications] = await Promise.all([
    prisma.session.findMany({
      where: { liveHostId, status: { not: "PENDING" } },
      select: { id: true, scheduledStart: true, scheduledEnd: true, isCampaignDay: true, status: true },
      orderBy: { scheduledStart: "asc" },
    }),
    prisma.hostPreference.findUnique({ where: { liveHostId }, select: { offDays: true } }),
    prisma.rLCreditAdjustment.findMany({ where: { liveHostId }, orderBy: { date: "asc" } }),
    prisma.rLApplication.findMany({ where: { liveHostId }, orderBy: { leaveDate: "asc" } }),
  ]);

  const offDays: string[] = preference?.offDays ? JSON.parse(preference.offDays) : [];

  const rawContribs: { date: string; hours: number; reason: "OFF_DAY" | "EXTRA_HOURS" | "MANUAL"; sessionId?: string; description: string }[] = [];

  for (const s of sessions) {
    const start = new Date(s.scheduledStart);
    const end = new Date(s.scheduledEnd);
    const durationH = (end.getTime() - start.getTime()) / 3600000;
    const mytDate = new Date(start.getTime() + 8 * 3600_000).toISOString().slice(0, 10);

    const isOffDay = offDays.includes(mytDate);
    const std = 6;

    if (isOffDay) {
      rawContribs.push({
        date: mytDate,
        hours: durationH,
        reason: "OFF_DAY",
        sessionId: s.id,
        description: `Off-day session (${durationH.toFixed(1)}h)`,
      });
    } else if (durationH > std) {
      const extra = durationH - std;
      rawContribs.push({
        date: mytDate,
        hours: extra,
        reason: "EXTRA_HOURS",
        sessionId: s.id,
        description: `Extra hours: +${extra.toFixed(1)}h beyond ${std}h standard`,
      });
    }
  }

  for (const adj of adjustments) {
    rawContribs.push({
      date: adj.date,
      hours: adj.hours,
      reason: "MANUAL",
      description: adj.reason,
    });
  }

  rawContribs.sort((a, b) => a.date.localeCompare(b.date));

  let runningHours = 0;
  let prevUnitsEarned = 0;
  const units: RLUnit[] = [];
  const contributions: RLContribution[] = [];

  for (const c of rawContribs) {
    runningHours = Math.max(0, runningHours + c.hours);

    const newUnitsEarned = Math.floor(runningHours / 6);
    if (newUnitsEarned > prevUnitsEarned) {
      for (let i = prevUnitsEarned; i < newUnitsEarned; i++) {
        // Unit is immediately available; expires 15 days from earn date
        const unlockDate = c.date;
        const e = new Date(c.date + "T00:00:00Z");
        e.setDate(e.getDate() + 15);
        const expiresAt = e.toISOString().slice(0, 10);
        units.push({
          unitNumber: i + 1,
          triggeredDate: c.date,
          unlockDate,
          expiresAt,
          isUnlocked: true,
          isExpired: expiresAt <= todayStr,
        });
      }
      prevUnitsEarned = newUnitsEarned;
    }

    contributions.push({ ...c, runningTotal: runningHours });
  }

  const unitsEarned = units.length;
  const approvedApps = applications.filter(a => a.status === "APPROVED");
  const pendingApps = applications.filter(a => a.status === "PENDING");
  const unitsUsed = approvedApps.length;
  const unitsPendingApproval = pendingApps.length;
  const unitsExpired = units.filter(u => u.isUnlocked && u.isExpired).length;
  const unitsActiveUnlocked = units.filter(u => u.isUnlocked && !u.isExpired).length;
  const unitsAvailable = Math.max(0, unitsActiveUnlocked - unitsUsed);
  const unitsPendingUnlock = units.filter(u => !u.isUnlocked).length;
  const hoursToNextUnit = runningHours > 0 ? (6 - (runningHours % 6)) % 6 || 6 : 6;

  return {
    totalHours: runningHours,
    unitsEarned,
    unitsExpired,
    unitsUsed,
    unitsPendingApproval,
    unitsAvailable,
    unitsPendingUnlock,
    hoursToNextUnit,
    contributions,
    units,
  };
}

// ── GET: host fetches own RL summary ─────────────────────────────────────────

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "LIVE_HOST") return Response.json({ error: "Forbidden" }, { status: 403 });

  const host = await prisma.liveHost.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!host) return Response.json({ error: "Host not found" }, { status: 404 });

  const [summary, applications] = await Promise.all([
    computeRLForHost(host.id),
    prisma.rLApplication.findMany({
      where: { liveHostId: host.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return Response.json({ summary, applications });
}

// ── POST: host applies for leave ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string; name?: string };
  if (user.role !== "LIVE_HOST") return Response.json({ error: "Forbidden" }, { status: 403 });

  const host = await prisma.liveHost.findUnique({ where: { userId: user.id }, select: { id: true, displayName: true } });
  if (!host) return Response.json({ error: "Host not found" }, { status: 404 });

  const { leaveDate, notes, halfDay, category } = await req.json();
  if (!leaveDate) return Response.json({ error: "leaveDate required" }, { status: 400 });

  // Advance notice: must be at least 3 days from today
  const todayStr = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const minDate = new Date(Date.now() + 8 * 3600_000 + 3 * 86400_000).toISOString().slice(0, 10);
  if (leaveDate < minDate) {
    return Response.json({ error: `Leave must be applied at least 3 days in advance (earliest: ${minDate})` }, { status: 400 });
  }

  // Check blackout dates
  const blackout = await prisma.rLBlackoutDate.findFirst({ where: { date: leaveDate } });
  if (blackout) {
    return Response.json({ error: `${leaveDate} is a blackout date: ${blackout.reason}` }, { status: 400 });
  }

  // Check available RL
  const summary = await computeRLForHost(host.id);
  if (summary.unitsAvailable < 1) {
    return Response.json({ error: "No available Replacement Leave units" }, { status: 400 });
  }

  // Check no duplicate application for same date
  const existing = await prisma.rLApplication.findFirst({
    where: { liveHostId: host.id, leaveDate, status: { in: ["PENDING", "APPROVED"] } },
  });
  if (existing) {
    return Response.json({ error: "You already have a leave application for this date" }, { status: 409 });
  }

  const app = await prisma.rLApplication.create({
    data: {
      id: `rl_${Date.now()}`,
      liveHostId: host.id,
      leaveDate,
      notes: notes || null,
      halfDay: halfDay || null,
      category: category || null,
    },
  });

  // Audit log
  await prisma.rLAuditLog.create({
    data: {
      id: `rla_${Date.now()}`,
      liveHostId: host.id,
      action: "APPLY",
      detail: `Applied for leave on ${leaveDate}${halfDay ? ` (${halfDay})` : ""}${category ? ` [${category}]` : ""}${notes ? ` — "${notes}"` : ""}`,
      performedBy: user.id,
    },
  });

  // Notify all admins
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  await Promise.all(admins.map(a => createNotification({
    userId: a.id,
    type: "rl_apply",
    title: "New Leave Application",
    message: `${host.displayName} applied for Replacement Leave on ${leaveDate}${halfDay ? ` (${halfDay} day)` : ""}.`,
  })));

  return Response.json({ ok: true, application: app });
}
