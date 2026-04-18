import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const clients = await prisma.client.findMany({
    include: {
      user: { select: { id: true, name: true, email: true } },
      brands: { select: { id: true, name: true, platform: true } },
    },
    orderBy: { user: { name: "asc" } },
  });
  return Response.json(clients);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });
  const { name, email, password } = await req.json();
  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      name, email, password: hashed, role: "CLIENT",
      client: { create: {} },
    },
    include: { client: true },
  });
  return Response.json(user, { status: 201 });
}
