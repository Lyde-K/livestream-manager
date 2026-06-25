import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// GET: return current liveHost permissions + type for a user
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const liveHost = await prisma.liveHost.findUnique({
    where: { userId: id },
    select: { id: true, type: true, permissions: true },
  });
  if (!liveHost) return Response.json({ error: "Not a live host" }, { status: 404 });

  return Response.json({ type: liveHost.type, permissions: liveHost.permissions });
}

// PATCH: save permission overrides for a liveHost
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json() as { permissions: Record<string, boolean> };

  const liveHost = await prisma.liveHost.findUnique({ where: { userId: id }, select: { id: true } });
  if (!liveHost) return Response.json({ error: "Not a live host" }, { status: 404 });

  await prisma.liveHost.update({
    where: { id: liveHost.id },
    data: { permissions: body.permissions },
  });

  return Response.json({ ok: true });
}
