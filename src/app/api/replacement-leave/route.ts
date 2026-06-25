import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

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
  isUnlocked: boolean;
}

export interface RLSummary {
  totalHours: number;
  unitsEarned: number;
  unitsUsed: number;        // approved applications
  unitsPendingApproval: number; // pending applications
  unitsAvailable: number;   // unlocked and not used
  unitsPendingUnlock: number; // earned but within 15-day window
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

  // Build contribution entries
  const rawContribs: { date: string; hours: number; reason: "OFF_DAY" | "EXTRA_HOURS" | "MANUAL"; sessionId?: string; description: string }[] = [];

  for (const s of sessions) {
    const start = new Date(s.scheduledStart);
    const end = new Date(s.scheduledEnd);
    const durationH = (end.getTime() - start.getTime()) / 3600000;
    // Convert to MYT date
    const mytDate = new Date(start.getTime() + 8 * 3600_000).toISOString().slice(0, 10);

    const isOffDay = offDays.includes(mytDate);
    const std = 6; // standard hours

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

  // Manual adjustments
  for (const adj of adjustments) {
    rawContribs.push({
      date: adj.date,
      hours: adj.hours,
      reason: "MANUAL",
      description: adj.reason,
    });
  }

  // Sort all by date
  rawContribs.sort((a, b) => a.date.localeCompare(b.date));

  // Compute running total and mark unit boundaries
  let runningHours = 0;
  let prevUnitsEarned = 0;
  const units: RLUnit[] = [];
  const contributions: RLContribution[] = [];

  for (const c of rawContribs) {
    const prev = runningHours;
    runningHours = Math.max(0, runningHours + c.hours); // can't go below 0

    const newUnitsEarned = Math.floor(runningHours / 6);
    if (newUnitsEarned > prevUnitsEarned) {
      for (let i = prevUnitsEarned; i < newUnitsEarned; i++) {
        const d = new Date(c.date + "T00:00:00Z");
        d.setDate(d.getDate() + 15);
        const unlockDate = d.toISOString().slice(0, 10);
        units.push({
          unitNumber: i + 1,
          triggeredDate: c.date,
          unlockDate,
          isUnlocked: unlockDate <= todayStr,
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
  const unitsUnlocked = units.filter(u => u.isUnlocked).length;
  const unitsAvailable = Math.max(0, unitsUnlocked - unitsUsed);
  const unitsPendingUnlock = units.filter(u => !u.isUnlocked).length;

  return {
    totalHours: runningHours,
    unitsEarned,
    unitsUsed,
    unitsPendingApproval,
    unitsAvailable,
    unitsPendingUnlock,
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
  const user = session.user as { id: string; role: string };
  if (user.role !== "LIVE_HOST") return Response.json({ error: "Forbidden" }, { status: 403 });

  const host = await prisma.liveHost.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!host) return Response.json({ error: "Host not found" }, { status: 404 });

  const { leaveDate, notes } = await req.json();
  if (!leaveDate) return Response.json({ error: "leaveDate required" }, { status: 400 });

  // Check they have available RL
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
    data: { id: `rl_${Date.now()}`, liveHostId: host.id, leaveDate, notes: notes || null },
  });

  return Response.json({ ok: true, application: app });
}
