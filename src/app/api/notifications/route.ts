import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string };

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { task: { select: { id: true, title: true } } },
    }),
    prisma.notification.count({ where: { userId: user.id, read: false } }),
  ]);

  return Response.json({ notifications, unreadCount });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string };

  const body = await req.json() as { markAllRead?: boolean };
  if (body.markAllRead) {
    await prisma.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
  }

  return Response.json({ ok: true });
}
