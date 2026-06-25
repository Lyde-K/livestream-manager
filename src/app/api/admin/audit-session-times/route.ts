import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Sessions that start between 01:00–07:59 MYT are almost never legitimate business hours.
// When the import bug was active, a session entered as "17:00 MYT" was stored as
// 17:00 UTC = 01:00 MYT next day — so these are the fingerprint of bad imports.
const SUSPICIOUS_MYT_START = 1;  // 01:00 MYT
const SUSPICIOUS_MYT_END   = 7;  // 07:59 MYT

function toMYTHour(utc: Date): number {
  return ((utc.getUTCHours() + 8) % 24);
}

function shiftMinus8h(utc: Date): Date {
  return new Date(utc.getTime() - 8 * 3_600_000);
}

// GET  → audit: list suspicious sessions (dry-run)
// POST → fix:   shift suspicious sessions back by 8 hours
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const sessions = await prisma.session.findMany({
    select: {
      id: true, scheduledStart: true, scheduledEnd: true,
      brand: { select: { name: true } },
      liveHost: { select: { displayName: true } },
      room:  { select: { name: true } },
    },
    orderBy: { scheduledStart: "asc" },
  });

  const suspicious = sessions.filter(s => {
    const h = toMYTHour(s.scheduledStart);
    return h >= SUSPICIOUS_MYT_START && h <= SUSPICIOUS_MYT_END;
  }).map(s => ({
    id: s.id,
    host: s.liveHost?.displayName ?? "(unassigned)",
    brand: s.brand.name,
    room: s.room?.name ?? "—",
    storedUtc: s.scheduledStart.toISOString(),
    currentMyt: `${toMYTHour(s.scheduledStart).toString().padStart(2,"0")}:${s.scheduledStart.getUTCMinutes().toString().padStart(2,"0")} MYT`,
    correctedMyt: (() => {
      const fixed = shiftMinus8h(s.scheduledStart);
      const h = (fixed.getUTCHours() + 8) % 24;
      return `${h.toString().padStart(2,"0")}:${fixed.getUTCMinutes().toString().padStart(2,"0")} MYT`;
    })(),
  }));

  return Response.json({
    total: sessions.length,
    suspicious: suspicious.length,
    sessions: suspicious,
    note: suspicious.length > 0
      ? "These sessions have MYT start times between 01:00–07:59, which suggests they were imported without the +08:00 timezone fix. POST to this endpoint with { fix: true } to correct them."
      : "No suspicious sessions found — all start times look correct.",
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (!body.fix) {
    return Response.json({ error: "Send { fix: true } to apply corrections." }, { status: 400 });
  }

  const sessions = await prisma.session.findMany({
    select: { id: true, scheduledStart: true, scheduledEnd: true },
    orderBy: { scheduledStart: "asc" },
  });

  const toFix = sessions.filter(s => {
    const h = toMYTHour(s.scheduledStart);
    return h >= SUSPICIOUS_MYT_START && h <= SUSPICIOUS_MYT_END;
  });

  const fixed: string[] = [];
  for (const s of toFix) {
    await prisma.session.update({
      where: { id: s.id },
      data: {
        scheduledStart: shiftMinus8h(s.scheduledStart),
        scheduledEnd:   shiftMinus8h(s.scheduledEnd),
      },
    });
    fixed.push(s.id);
  }

  return Response.json({
    ok: true,
    fixed: fixed.length,
    ids: fixed,
    note: fixed.length > 0
      ? `Shifted ${fixed.length} session(s) back by 8 hours. Their times now reflect the intended MYT values.`
      : "No sessions required correction.",
  });
}
