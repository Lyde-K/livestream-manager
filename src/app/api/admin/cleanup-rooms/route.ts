import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const KEEP = ["Room 1","Room 2","Room 3","Room 4","Room 5","Room 6","Room 7","Room 8","Room 9","Room 10"];

export async function POST() {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const deleted = await prisma.room.deleteMany({ where: { name: { notIn: KEEP } } });
  const remaining = await prisma.room.findMany({ select: { name: true }, orderBy: { name: "asc" } });
  return Response.json({ deleted: deleted.count, remaining: remaining.map(r => r.name) });
}
