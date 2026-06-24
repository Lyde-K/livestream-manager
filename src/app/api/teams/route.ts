import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/tasks/id";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string };

  const teams = await prisma.team.findMany({
    where: { members: { some: { userId: user.id } } },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return Response.json({ teams });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; name?: string };

  const body = await req.json() as { name: string; description?: string; memberIds?: string[] };
  if (!body.name?.trim()) return Response.json({ error: "Name required" }, { status: 400 });

  const memberIds = Array.from(new Set([user.id, ...(body.memberIds ?? [])]));

  const team = await prisma.team.create({
    data: {
      id: createId(),
      name: body.name.trim(),
      description: body.description?.trim() || null,
      createdById: user.id,
      members: {
        create: memberIds.map((uid) => ({
          userId: uid,
          role: uid === user.id ? "owner" : "member",
        })),
      },
    },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  return Response.json({ team }, { status: 201 });
}
