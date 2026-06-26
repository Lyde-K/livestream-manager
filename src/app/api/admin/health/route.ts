import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  // ── Schedule checks ──────────────────────────────────────────────────────

  // 1. Ghost sessions: no host AND no room
  const ghostSessions = await prisma.session.count({
    where: { liveHostId: null, roomId: null },
  });

  // 2. Suspicious MYT times: starting before 08:00 MYT = UTC hour 16–23
  const recentSessions = await prisma.session.findMany({
    select: { id: true, scheduledStart: true, liveHost: { select: { displayName: true } }, brand: { select: { name: true } } },
    where: { scheduledStart: { gte: new Date(Date.now() - 90 * 24 * 3600_000) } },
  });

  const suspiciousMYT = recentSessions.filter(s => {
    const h = new Date(s.scheduledStart).getUTCHours();
    return h >= 16 && h <= 23;
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
        label: "Sessions starting before 08:00 MYT (last 90 days)",
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
