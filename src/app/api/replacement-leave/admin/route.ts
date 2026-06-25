import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { computeRLForHost } from "../route";

// GET: admin fetches all hosts' RL summaries + pending applications
export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  const [hosts, pendingApps] = await Promise.all([
    prisma.liveHost.findMany({
      where: { isActive: true },
      select: { id: true, displayName: true, user: { select: { name: true } } },
      orderBy: { displayName: "asc" },
    }),
    prisma.rLApplication.findMany({
      where: { status: "PENDING" },
      include: { liveHost: { select: { id: true, displayName: true, user: { select: { name: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Compute RL for each host in parallel (cap at 10 parallel to avoid DB pressure)
  const summaries = await Promise.all(
    hosts.map(async (h) => ({
      host: h,
      summary: await computeRLForHost(h.id),
    }))
  );

  return Response.json({ summaries, pendingApps });
}

// POST: admin adds a manual credit adjustment for a host
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  const { liveHostId, date, hours, reason } = await req.json();
  if (!liveHostId || !date || hours === undefined || !reason) {
    return Response.json({ error: "liveHostId, date, hours, reason required" }, { status: 400 });
  }

  const adj = await prisma.rLCreditAdjustment.create({
    data: { id: `rladj_${Date.now()}`, liveHostId, date, hours: Number(hours), reason, addedBy: user.id },
  });

  return Response.json({ ok: true, adjustment: adj });
}

// DELETE: admin removes a manual credit adjustment
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  await prisma.rLCreditAdjustment.delete({ where: { id } });
  return Response.json({ ok: true });
}
