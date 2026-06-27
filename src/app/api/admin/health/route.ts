import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE: remove duplicate sessions detected by the health check.
// Handles two cases:
//   1. Imported (TT-/SP-) session alongside a matching admin session (same host, ±2h start)
//   2. Duplicate imported sessions — same externalRef prefix group imported twice
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  if (req.headers.get("x-confirm-delete-duplicates") !== "yes-delete-import-duplicates")
    return Response.json({ error: "Missing confirmation header" }, { status: 400 });

  const toDelete = new Set<string>();

  // ── Case 1: TT-/SP- session paired with an admin session (same host, ±2h) ─
  const imported = await prisma.session.findMany({
    where: {
      OR: [
        { externalRef: { startsWith: "TT-" } },
        { externalRef: { startsWith: "SP-" } },
        { externalRef: { startsWith: "GS-" } },
      ],
    },
    select: { id: true, liveHostId: true, scheduledStart: true, brandId: true },
  });

  for (const imp of imported) {
    if (!imp.liveHostId) continue;
    const windowStart = new Date(imp.scheduledStart.getTime() - 2 * 3600_000);
    const windowEnd   = new Date(imp.scheduledStart.getTime() + 2 * 3600_000);
    const adminExists = await prisma.session.findFirst({
      where: {
        id:         { not: imp.id },
        brandId:    imp.brandId,
        liveHostId: imp.liveHostId,
        scheduledStart: { gte: windowStart, lte: windowEnd },
        AND: [
          { OR: [{ externalRef: null }, { externalRef: { not: { startsWith: "TT-" } } }] },
          { OR: [{ externalRef: null }, { externalRef: { not: { startsWith: "SP-" } } }] },
        ],
      },
      select: { id: true },
    });
    if (adminExists) toDelete.add(imp.id);
  }

  // ── Case 2: duplicate imported sessions (same host + same scheduledStart) ─
  // Group all sessions that share liveHostId + scheduledStart; keep the earliest,
  // delete the rest. This catches double-imports of the same xlsx.
  const allSessions = await prisma.session.findMany({
    select: { id: true, liveHostId: true, scheduledStart: true, externalRef: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const byKey = new Map<string, string[]>();
  for (const s of allSessions) {
    if (!s.liveHostId) continue;
    const key = `${s.liveHostId}::${s.scheduledStart.toISOString()}`;
    const group = byKey.get(key) ?? [];
    group.push(s.id);
    byKey.set(key, group);
  }

  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    // Keep the first (earliest createdAt); mark the rest for deletion
    // but ONLY delete import sessions — never delete admin sessions
    for (let i = 1; i < group.length; i++) {
      const s = allSessions.find(x => x.id === group[i])!;
      const isImport = s.externalRef?.startsWith("TT-") || s.externalRef?.startsWith("SP-") || s.externalRef?.startsWith("GS-");
      if (isImport) toDelete.add(s.id);
    }
  }

  const ids = [...toDelete];
  if (ids.length === 0) return Response.json({ ok: true, deleted: 0 });

  await prisma.session.deleteMany({ where: { id: { in: ids } } });
  return Response.json({ ok: true, deleted: ids.length });
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
    select: { id: true, scheduledStart: true, externalRef: true, liveHost: { select: { displayName: true } }, brand: { select: { name: true } } },
    where: { scheduledStart: { gte: new Date(Date.now() - 90 * 24 * 3600_000) } },
  });

  const suspiciousMYT = recentSessions.filter(s => {
    const h = new Date(s.scheduledStart).getUTCHours();
    return h >= 20 && h <= 21;
  });

  // 3. Duplicate sessions: same host + same scheduledStart
  const sessionsByKey = new Map<string, typeof recentSessions>();
  for (const s of recentSessions) {
    const key = `${s.liveHost?.displayName ?? "none"}::${new Date(s.scheduledStart).toISOString()}`;
    const group = sessionsByKey.get(key) ?? [];
    group.push(s);
    sessionsByKey.set(key, group);
  }
  const duplicateGroups = [...sessionsByKey.values()].filter(g => g.length > 1);
  const duplicatePairs = duplicateGroups.reduce((sum, g) => sum + (g.length - 1), 0);
  // Sample: show the first 5 duplicate groups with their externalRefs so we can diagnose
  const duplicateSample = duplicateGroups.slice(0, 5).map(g => ({
    host: g[0].liveHost?.displayName ?? "none",
    start: new Date(g[0].scheduledStart).toISOString(),
    sessions: g.map(s => ({ id: s.id, externalRef: s.externalRef ?? "(admin)" })),
  }));

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
        sample: duplicateSample,
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
