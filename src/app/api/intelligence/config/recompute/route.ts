import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await auth();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { role: string };
  if (user.role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const result = await prisma.sessionInsight.deleteMany({});
  return Response.json({ ok: true, invalidated: result.count });
}
