import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      liveHost: { select: { id: true, displayName: true, isActive: true } },
      client:   { select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return Response.json(users);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { name, email, password, role, displayName } = await req.json();

  if (!name || !email || !password || !role)
    return Response.json({ error: "Missing required fields" }, { status: 400 });

  if (!["ADMIN", "LIVE_HOST", "CLIENT"].includes(role))
    return Response.json({ error: "Invalid role" }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing)
    return Response.json({ error: "Email already in use" }, { status: 409 });

  const hashed = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      role,
      ...(role === "LIVE_HOST" && {
        liveHost: {
          create: {
            displayName: (displayName || name).toUpperCase(),
            workingDays: 5,
            type: "FULL_TIME",
            hourlyRate: 40,
          },
        },
      }),
      ...(role === "CLIENT" && {
        client: { create: {} },
      }),
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  return Response.json(user, { status: 201 });
}
