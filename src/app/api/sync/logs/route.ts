import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET — list sync log entries (admin only)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const showResolved = searchParams.get("resolved") === "true";

  const logs = await prisma.syncLog.findMany({
    where: showResolved ? {} : { resolved: false },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return Response.json(logs);
}

// PATCH — mark one or all as resolved
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id, resolveAll } = await req.json();

  if (resolveAll) {
    await prisma.syncLog.updateMany({ where: { resolved: false }, data: { resolved: true } });
    return Response.json({ ok: true });
  }
  if (id) {
    await prisma.syncLog.update({ where: { id }, data: { resolved: true } });
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Provide id or resolveAll" }, { status: 400 });
}
