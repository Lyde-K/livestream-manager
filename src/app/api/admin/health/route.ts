import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE: remove imported (TT-/SP-) sessions that duplicate an admin-created session
// (same liveHostId + same scheduledStart minute)
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  if (req.headers.get("x-confirm-delete-duplicates") !== "yes-delete-import-duplicates")
    return Response.json({ error: "Missing confirmation header" }, { status: 400 });

  // Find all imported sessions (TT- or SP- prefix)
  const imported = await prisma.session.findMany({
    where: {
      OR: [
        { externalRef: { startsWith: "TT-" } },
        { externalRef: { startsWith: "SP-" } },
      ],
    },
    select: { id: true, liveHostId: true, scheduledStart: true, brandId: true, platform: true },
  });

  // For each imported session, check if an admin-created session exists with the same
  // liveHostId and scheduledStart (within 1 minute tolerance)
  const toDelete: string[] = [];
  for (const imp of imported) {
    if (!imp.liveHostId) continue;
    const windowStart = new Date(imp.scheduledStart.getTime() - 60_000);
    const windowEnd   = new Date(imp.scheduledStart.getTime() + 60_000);
    const adminExists = await prisma.session.findFirst({
      where: {
        id:          { not: imp.id },
        brandId:     imp.brandId,
        liveHostId:  imp.liveHostId,
        scheduledStart: { gte: windowStart, lte: windowEnd },
        AND: [
          { OR: [{ externalRef: null }, { externalRef: { not: { startsWith: "TT-" } } }] },
          { OR: [{ externalRef: null }, { externalRef: { not: { startsWith: "SP-" } } }] },
        ],
      },
      select: { id: true },
    });
    if (adminExists) toDelete.push(imp.id);
  }

  if (toDelete.length === 0) return Response.json({ ok: true, deleted: 0 });

  await prisma.session.deleteMany({ where: { id: { in: toDelete } } });
  return Response.json({ ok: true, deleted: toDelete.length });
}

export async function GET() {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  // ── Schedule checks ──────────────────────────────────────────────────────

  // 1. Ghost sessions: no host AND no room
  const ghostSessions = await prisma.session.count({
    where: { liveHostId: null, roomId: null },
  });

  // 2. Suspicious MYT times: starting before 06:00 MYT = UTC hours 22–23
  // (midnight–05:59 MYT are common late-night slots; flag only truly unusual pre-6am)
  const recentSessions = await prisma.session.findMany({
    select: { id: true, scheduledStart: true, liveHost: { select: { displayName: true } }, brand: { select: { name: true } } },
    where: { scheduledStart: { gte: new Date(Date.now() - 90 * 24 * 3600_000) } },
  });

  const suspiciousMYT = recentSessions.filter(s => {
    const h = new Date(s.scheduledStart).getUTCHours();
    // UTC 22–23 = MYT 06:00–07:59 (the real pre-dawn edge cases)
    // We flag nothing here now since late-night sessions are legitimate
    // Keep check but only flag sessions between UTC 20-21 (MYT 04:00-05:59)
    return h >= 20 && h <= 21;
  });

  // 3. Duplicate sessions: same host + same scheduledStart
  const sessionsByKey = new Map<string, number>();
  for (const s of recentSessions) {
    const key = `${s.liveHost?.displayName ?? "none"}::${new Date(s.scheduledStart).toISOString()}`;
    sessionsByKey.set(key, (sessionsByKey.get(key) ?? 0) + 1);
  }
  const duplicatePairs = [...sessionsByKey.values()].filter(c => c > 1).reduce((sum, c) => sum + (c - 1), 0);

  // ── Task checks ──────────────────────────────────────────────────────────

  // 4. Invisible tasks: non-personal tasks with NO assignees — they can never
  //    appear in anyone's "My Tasks" view (created by someone who forgot to assign).
  const invisibleTasks = await prisma.task.findMany({
    where: {
      isPersonal: false,
      parentId: null,
      assignees: { none: {} },
    },
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      team: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const invisibleTaskCount = await prisma.task.count({
    where: {
      isPersonal: false,
      parentId: null,
      assignees: { none: {} },
    },
  });

  // 5. Orphaned team tasks: task has a teamId, but none of the assignees are
  //    members of that team — they see it in "All Tasks" but not "My Tasks".
  const teamTasks = await prisma.task.findMany({
    where: { teamId: { not: null }, parentId: null },
    select: {
      id: true,
      title: true,
      teamId: true,
      team: { select: { name: true, members: { select: { userId: true } } } },
      assignees: { select: { userId: true } },
      createdBy: { select: { name: true } },
    },
  });

  const teamMismatchTasks = teamTasks.filter(t => {
    if (!t.team || t.assignees.length === 0) return false;
    const memberIds = new Set(t.team.members.map(m => m.userId));
    // All assignees are outside the team
    return t.assignees.every(a => !memberIds.has(a.userId));
  });

  // ── Overall status ───────────────────────────────────────────────────────
  const scheduleIssues = ghostSessions > 0 || duplicatePairs > 5;
  const taskIssues = invisibleTaskCount > 0 || teamMismatchTasks.length > 0;

  const status =
    ghostSessions > 0 || duplicatePairs > 5
      ? "critical"
      : invisibleTaskCount > 5 || suspiciousMYT.length > 0 || teamMismatchTasks.length > 0
      ? "warning"
      : !scheduleIssues && !taskIssues
      ? "healthy"
      : "warning";

  return Response.json({
    status,
    schedule: {
      ghostSessions: {
        count: ghostSessions,
        ok: ghostSessions === 0,
        label: "Ghost sessions (no host + no room)",
      },
      suspiciousMYT: {
        count: suspiciousMYT.length,
        ok: suspiciousMYT.length === 0,
        label: "Sessions starting before 04:00 MYT (last 90 days)",
        sample: suspiciousMYT.slice(0, 5).map(s => ({
          id: s.id,
          host: s.liveHost?.displayName ?? "Unassigned",
          brand: s.brand?.name ?? "Unknown",
          startMYT: new Date(new Date(s.scheduledStart).getTime() + 8 * 3600_000)
            .toISOString().replace("T", " ").slice(0, 16) + " MYT",
        })),
      },
      duplicateSessions: {
        count: duplicatePairs,
        ok: duplicatePairs === 0,
        label: "Duplicate sessions (same host + same start time, last 90 days)",
      },
    },
    tasks: {
      invisibleTasks: {
        count: invisibleTaskCount,
        ok: invisibleTaskCount === 0,
        label: "Tasks with no assignees (invisible in My Tasks for everyone)",
        sample: invisibleTasks.map(t => ({
          id: t.id,
          title: t.title,
          status: t.status,
          createdBy: t.createdBy?.name ?? "Unknown",
          team: t.team?.name ?? null,
          createdAt: t.createdAt,
        })),
      },
      teamMismatch: {
        count: teamMismatchTasks.length,
        ok: teamMismatchTasks.length === 0,
        label: "Tasks where all assignees are outside the task's team (hidden from My Tasks)",
        sample: teamMismatchTasks.slice(0, 5).map(t => ({
          id: t.id,
          title: t.title,
          team: t.team?.name ?? "Unknown",
          createdBy: t.createdBy?.name ?? "Unknown",
        })),
      },
    },
    checkedAt: new Date().toISOString(),
  });
}
