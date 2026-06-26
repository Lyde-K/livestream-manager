import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  // ── Level 2: Detection checks ────────────────────────────────────────────

  // 1. Ghost sessions: no host AND no room — should be 0 after cleanup
  const ghostSessions = await prisma.session.count({
    where: { liveHostId: null, roomId: null },
  });

  // 2. Suspicious MYT times: sessions starting before 08:00 MYT (UTC+8)
  //    In UTC terms, that's sessions starting between 16:00–23:59 UTC (prev day)
  //    We check via raw hour on scheduledStart UTC: hour 16–23 = midnight–07:59 MYT
  const allSessions = await prisma.session.findMany({
    select: { id: true, scheduledStart: true, liveHost: { select: { displayName: true } }, brand: { select: { name: true } } },
    where: {
      scheduledStart: { gte: new Date(Date.now() - 90 * 24 * 3600_000) },
    },
  });

  const suspiciousMYT = allSessions.filter(s => {
    const utcHour = new Date(s.scheduledStart).getUTCHours();
    // UTC 16–23 = MYT 00:00–07:59 (next day)
    return utcHour >= 16 && utcHour <= 23;
  });

  // 3. Duplicate sessions: same host + same scheduledStart
  const sessionsByKey = new Map<string, number>();
  for (const s of allSessions) {
    const key = `${s.liveHost?.displayName ?? "none"}::${new Date(s.scheduledStart).toISOString()}`;
    sessionsByKey.set(key, (sessionsByKey.get(key) ?? 0) + 1);
  }
  const duplicatePairs = [...sessionsByKey.values()].filter(c => c > 1).reduce((sum, c) => sum + (c - 1), 0);

  const status = ghostSessions === 0 && suspiciousMYT.length === 0 && duplicatePairs === 0
    ? "healthy"
    : ghostSessions > 0 || duplicatePairs > 5
    ? "critical"
    : "warning";

  return Response.json({
    status,
    checks: {
      ghostSessions: {
        count: ghostSessions,
        ok: ghostSessions === 0,
        label: "Ghost sessions (no host + no room)",
        fix: ghostSessions > 0 ? "DELETE /api/admin/sessions/orphaned with header x-confirm-delete-orphaned: yes-delete-all-orphaned" : null,
      },
      suspiciousMYT: {
        count: suspiciousMYT.length,
        ok: suspiciousMYT.length === 0,
        label: "Sessions starting before 08:00 MYT (last 90 days)",
        sample: suspiciousMYT.slice(0, 5).map(s => ({
          id: s.id,
          host: s.liveHost?.displayName ?? "Unassigned",
          brand: s.brand?.name ?? "Unknown",
          startMYT: new Date(new Date(s.scheduledStart).getTime() + 8 * 3600_000).toISOString().replace("T", " ").slice(0, 16) + " MYT",
        })),
      },
      duplicateSessions: {
        count: duplicatePairs,
        ok: duplicatePairs === 0,
        label: "Duplicate sessions (same host + same start time, last 90 days)",
      },
    },
    checkedAt: new Date().toISOString(),
  });
}
