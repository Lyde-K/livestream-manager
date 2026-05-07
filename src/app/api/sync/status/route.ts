import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  return Response.json({ lastSyncAt: settings?.lastSyncAt ?? null });
}
