import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const TOLERANCE_MS   = 10 * 60 * 1000; // ±10 min

export interface DuplicatePair {
  wrongId:   string;
  correctId: string;
  host:      string;
  brand:     string;
  platform:  string;
  wrongTime:   string;   // ISO – the 8h-shifted (wrong) session
  correctTime: string;   // ISO – the properly-stored session
  wrongRef:    string | null;
  correctRef:  string | null;
  wrongHasData:   boolean;
  correctHasData: boolean;
}

/**
 * GET  /api/admin/sessions/duplicates
 *   Returns all session pairs that differ by ~8 hours (same host/brand/platform).
 *   The session whose scheduledStart is 8h LATER is the "wrong" one
 *   (old timezone bug stored SGT time as UTC, inflating the timestamp by +8h).
 *
 * DELETE /api/admin/sessions/duplicates
 *   Body: { ids: string[] }  — permanently deletes those sessions.
 */

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  // Load all sessions that came from GS sync (have externalRef) + any PENDING
  // sessions that might be duplicates of synced ones.
  const allSessions = await prisma.session.findMany({
    select: {
      id: true,
      liveHostId: true,
      brandId: true,
      platform: true,
      scheduledStart: true,
      externalRef: true,
      gmv: true,
      status: true,
      liveHost: { include: { user: { select: { name: true } } } },
      brand: { select: { name: true } },
    },
    orderBy: { scheduledStart: "asc" },
  });

  // Group by (liveHostId, brandId, platform)
  type Row = typeof allSessions[number];
  const groups = new Map<string, Row[]>();
  for (const s of allSessions) {
    const key = `${s.liveHostId}|${s.brandId}|${s.platform}`;
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }

  const pairs: DuplicatePair[] = [];
  const seen = new Set<string>();

  for (const rows of groups.values()) {
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i];
        const b = rows[j];
        const diff = Math.abs(b.scheduledStart.getTime() - a.scheduledStart.getTime());
        if (diff < EIGHT_HOURS_MS - TOLERANCE_MS || diff > EIGHT_HOURS_MS + TOLERANCE_MS) continue;

        // Skip if we've already paired one of these
        if (seen.has(a.id) || seen.has(b.id)) continue;

        // The one with the later scheduledStart is the wrong one (+8h inflated)
        const wrong   = a.scheduledStart > b.scheduledStart ? a : b;
        const correct = a.scheduledStart > b.scheduledStart ? b : a;

        seen.add(wrong.id);
        seen.add(correct.id);

        pairs.push({
          wrongId:        wrong.id,
          correctId:      correct.id,
          host:           wrong.liveHost.user.name,
          brand:          wrong.brand.name,
          platform:       wrong.platform,
          wrongTime:      wrong.scheduledStart.toISOString(),
          correctTime:    correct.scheduledStart.toISOString(),
          wrongRef:       wrong.externalRef,
          correctRef:     correct.externalRef,
          wrongHasData:   wrong.gmv !== null,
          correctHasData: correct.gmv !== null,
        });
      }
    }
  }

  return Response.json({ pairs, total: pairs.length });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  let ids: string[];
  try {
    const body = await req.json();
    ids = Array.isArray(body.ids) ? body.ids : [];
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (ids.length === 0)
    return Response.json({ error: "No IDs provided" }, { status: 400 });

  const { count } = await prisma.session.deleteMany({ where: { id: { in: ids } } });
  return Response.json({ ok: true, deleted: count });
}
