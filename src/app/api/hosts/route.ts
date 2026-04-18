import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const hosts = await prisma.liveHost.findMany({
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
    orderBy: { displayName: "asc" },
  });
  return Response.json(hosts);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { name, email, password, displayName, workingDays, type, hourlyRate, contactNo, icNo, bankName, bankAccount } = await req.json();
  const hashed = await bcrypt.hash(password, 10);
  const isPartTime = type === "PART_TIME";

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      role: "LIVE_HOST",
      liveHost: {
        create: {
          displayName: displayName.toUpperCase(),
          workingDays: isPartTime ? 0 : (Number(workingDays) || 5),
          type: type || "FULL_TIME",
          hourlyRate: isPartTime ? (Number(hourlyRate) || 40) : 40,
          contactNo: contactNo || null,
          icNo: icNo || null,
          bankName: bankName || null,
          bankAccount: bankAccount || null,
        },
      },
    },
    include: { liveHost: true },
  });
  return Response.json(user, { status: 201 });
}
