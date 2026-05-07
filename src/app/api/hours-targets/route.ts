import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = Number(searchParams.get("month")) || new Date().getMonth() + 1;
  const year = Number(searchParams.get("year")) || new Date().getFullYear();

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  const [hosts, brands, targets, sessions] = await Promise.all([
    prisma.liveHost.findMany({
      where: { isActive: true },
      select: { id: true, displayName: true, user: { select: { name: true } } },
      orderBy: { displayName: "asc" },
    }),
    prisma.brand.findMany({
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    }),
    prisma.monthlyHoursTarget.findMany({
      where: { month, year },
    }),
    prisma.session.findMany({
      where: {
        scheduledStart: { gte: monthStart, lt: monthEnd },
        status: { in: ["PENDING", "COMPLETED"] },
      },
      select: { liveHostId: true, brandId: true, scheduledStart: true, scheduledEnd: true, actualDurationMinutes: true },
    }),
  ]);

  const targetMap = new Map(targets.map(t => [`${t.type}::${t.referenceId}`, t.targetHours]));

  function scheduledHours(type: "HOST" | "BRAND", id: string): number {
    let totalMin = 0;
    for (const s of sessions) {
      const matches = type === "HOST" ? s.liveHostId === id : s.brandId === id;
      if (!matches) continue;
      if (s.actualDurationMinutes) {
        totalMin += s.actualDurationMinutes;
      } else {
        const ms = new Date(s.scheduledEnd).getTime() - new Date(s.scheduledStart).getTime();
        totalMin += ms / 60000;
      }
    }
    return Math.round((totalMin / 60) * 10) / 10;
  }

  const hostRows = hosts.map(h => ({
    id: h.id,
    name: h.user.name,
    displayName: h.displayName,
    scheduled: scheduledHours("HOST", h.id),
    target: targetMap.get(`HOST::${h.id}`) ?? 0,
  }));

  const brandRows = brands.map(b => ({
    id: b.id,
    name: b.name,
    color: b.color,
    scheduled: scheduledHours("BRAND", b.id),
    target: targetMap.get(`BRAND::${b.id}`) ?? 0,
  }));

  return Response.json({ month, year, hosts: hostRows, brands: brandRows });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { role: string };
  if (user.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { type: "HOST" | "BRAND"; referenceId: string; month: number; year: number; targetHours: number };
  const { type, referenceId, month, year, targetHours } = body;

  if (!type || !referenceId || !month || !year || targetHours == null) {
    return Response.json({ error: "Missing fields" }, { status: 400 });
  }

  const updated = await prisma.monthlyHoursTarget.upsert({
    where: { type_referenceId_month_year: { type, referenceId, month, year } },
    update: { targetHours },
    create: { type, referenceId, month, year, targetHours },
  });

  return Response.json({ ok: true, updated });
}
