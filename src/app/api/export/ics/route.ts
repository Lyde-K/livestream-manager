import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";

function toICSDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const user = session.user as { id: string; role: string };

  const where: Record<string, unknown> = {};
  if (start && end) where.scheduledStart = { gte: new Date(start), lte: new Date(end) };
  if (user.role === "LIVE_HOST") {
    const host = await prisma.liveHost.findUnique({ where: { userId: user.id } });
    if (host) where.liveHostId = host.id;
  }

  const sessions = await prisma.session.findMany({
    where,
    include: { room: true, brand: true, liveHost: { include: { user: true } } },
  });

  const events = sessions.map((s) => [
    "BEGIN:VEVENT",
    `UID:${s.id}@13media`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(new Date(s.scheduledStart))}`,
    `DTEND:${toICSDate(new Date(s.scheduledEnd))}`,
    `SUMMARY:${s.brand.name} Livestream — ${s.room?.name ?? "TBD"}`,
    `DESCRIPTION:Platform: ${s.platform}\\nRoom: ${s.room?.name ?? "TBD"}\\nHost: ${s.liveHost?.user.name ?? "Unassigned"}`,
    `LOCATION:${s.room?.name ?? "TBD"}`,
    "END:VEVENT",
  ].join("\r\n")).join("\r\n");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//13 Media//Livestream Manager//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    events,
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="schedule.ics"`,
    },
  });
}
