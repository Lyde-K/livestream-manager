import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toMytDateStr } from "@/lib/utils";

function campaignBlackoutDays(startDate: Date, n = 2): string[] {
  return Array.from({ length: n }, (_, i) =>
    toMytDateStr(new Date(startDate.getTime() + i * 86_400_000))
  );
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const user = session.user as { id: string };
  const { id } = await params;
  const { name, platform, startDate, endDate, brandId, notes } = await req.json();
  const start = new Date(startDate);
  const end   = new Date(endDate);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const old = await (prisma as any).campaign.findUnique({ where: { id }, select: { startDate: true, name: true } });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campaign = await (prisma as any).campaign.update({
    where: { id },
    data: {
      name, platform,
      startDate: start,
      endDate:   end,
      month: start.getMonth() + 1,
      year:  start.getFullYear(),
      brandId: brandId || null,
      notes: notes || null,
      updatedAt: new Date(),
    },
    include: { brand: { select: { id: true, name: true, color: true } } },
  });

  // If start date changed, remove old blackout days and create new ones
  if (old && toMytDateStr(old.startDate) !== toMytDateStr(start)) {
    const oldDays = campaignBlackoutDays(old.startDate);
    await Promise.all(oldDays.map(date =>
      prisma.rLBlackoutDate.deleteMany({ where: { id: { startsWith: `bl_camp_${id}_` }, date } })
    ));
    const newDays = campaignBlackoutDays(start);
    await Promise.all(newDays.map(async (date, i) => {
      const existing = await prisma.rLBlackoutDate.findFirst({ where: { date } });
      if (!existing) {
        await prisma.rLBlackoutDate.create({
          data: { id: `bl_camp_${id}_d${i + 1}`, date, reason: `Campaign: ${name} (Day ${i + 1})`, createdBy: user.id },
        });
      }
    }));
  }

  return Response.json(campaign);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  // Remove the auto-created blackout dates for this campaign before deleting
  await prisma.rLBlackoutDate.deleteMany({ where: { id: { startsWith: `bl_camp_${id}_` } } });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma as any).campaign.delete({ where: { id } });
  return Response.json({ ok: true });
}
