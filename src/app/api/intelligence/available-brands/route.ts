import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface BrandOption {
  id: string;
  name: string;
  color: string;
}

export async function GET() {
  const session = await auth();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role: string };

  let brands: BrandOption[] = [];
  if (user.role === "ADMIN") {
    brands = await prisma.brand.findMany({
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    });
  } else if (user.role === "CLIENT") {
    const client = await prisma.client.findUnique({
      where: { userId: user.id },
      include: {
        brands: {
          select: { id: true, name: true, color: true },
          orderBy: { name: "asc" },
        },
      },
    });
    brands = client?.brands ?? [];
  } else if (user.role === "LIVE_HOST") {
    const host = await prisma.liveHost.findUnique({ where: { userId: user.id } });
    if (host) {
      const sessions = await prisma.session.findMany({
        where: { liveHostId: host.id, status: "COMPLETED" },
        select: { brandId: true },
        distinct: ["brandId"],
      });
      const ids = sessions.map((s) => s.brandId);
      brands = await prisma.brand.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, color: true },
        orderBy: { name: "asc" },
      });
    }
  }

  return Response.json({ brands });
}
