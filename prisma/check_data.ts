import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

const dbPath = path.resolve(process.cwd(), "dev.db");
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  // Admins
  const admins = await (prisma as any).user.findMany({ where: { role: "ADMIN" }, select: { email: true, name: true } });
  console.log("Admins:", JSON.stringify(admins));

  // Part-time hosts
  const ptHosts = await (prisma as any).liveHost.findMany({
    where: { type: "PART_TIME" },
    include: { user: { select: { name: true } } },
  });
  console.log("Part-time hosts:", ptHosts.map((h: any) => `${h.displayName} (${h.user.name})`).join(", "));

  // Session counts
  const totalSessions = await (prisma as any).session.count();
  const ttSessions = await (prisma as any).session.count({ where: { platform: "TIKTOK" } });
  const shpSessions = await (prisma as any).session.count({ where: { platform: "SHOPEE" } });
  const ptSessions = await (prisma as any).session.count({ where: { liveHost: { type: "PART_TIME" } } });
  console.log(`Sessions: ${totalSessions} total (TT: ${ttSessions}, SHP: ${shpSessions}, part-time: ${ptSessions})`);

  // Sample TT session with adsCost
  const sample = await (prisma as any).session.findFirst({
    where: { platform: "TIKTOK", status: "COMPLETED" },
    include: { brand: true, liveHost: { include: { user: true } } },
  });
  if (sample) {
    console.log("Sample TT session:", {
      host: sample.liveHost.displayName,
      brand: sample.brand.name,
      gmv: sample.gmv,
      grossRevenue: sample.grossRevenue,
      adsCost: sample.adsCost,
      minutes: sample.actualDurationMinutes,
    });
  }

  // Sample PT session
  const ptSample = await (prisma as any).session.findFirst({
    where: { liveHost: { type: "PART_TIME" }, status: "COMPLETED" },
    include: { brand: true, liveHost: true },
  });
  if (ptSample) {
    console.log("Sample PT session:", {
      host: ptSample.liveHost.displayName,
      brand: ptSample.brand.name,
      minutes: ptSample.actualDurationMinutes,
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
