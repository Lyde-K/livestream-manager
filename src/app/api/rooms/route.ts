import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rooms = await prisma.room.findMany({ orderBy: { name: "asc" } });
  return Response.json(rooms, {
    headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });
  const { name, notes } = await req.json();
  const room = await prisma.room.create({ data: { name, notes } });
  return Response.json(room, { status: 201 });
}
