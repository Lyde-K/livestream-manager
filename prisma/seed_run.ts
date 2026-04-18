import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";
import path from "path";

const dbPath = path.resolve(process.cwd(), "dev.db");
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

async function main() {
  const adminPassword = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@13media.co" },
    update: {},
    create: { email: "admin@13media.co", name: "Admin", password: adminPassword, role: "ADMIN" },
  });
  console.log("✓ Admin: admin@13media.co / admin123");

  const rooms = ["Room 1","Room 2","Room 3","Room 4","Room 5","Room 6","Room 7","Room 8","Room 9","Room 10"];
  for (const name of rooms) {
    await prisma.room.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log("✓ 10 rooms");

  const brandColors = ["#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#8b5cf6","#06b6d4","#84cc16","#f97316"];
  const brands = [
    { name: "Tefal", platform: "TIKTOK" },
    { name: "Shopee Mall", platform: "SHOPEE" },
    { name: "Mars", platform: "TIKTOK" },
    { name: "Dettol", platform: "TIKTOK" },
    { name: "Unicharm", platform: "TIKTOK" },
  ];
  for (let i = 0; i < brands.length; i++) {
    await prisma.brand.upsert({
      where: { name: brands[i].name },
      update: {},
      create: { ...brands[i], color: brandColors[i % brandColors.length] },
    });
  }
  console.log("✓ 5 sample brands");

  await prisma.commissionRule.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", name: "Default Rule", lateSessionsThreshold: 5, lateDeductionPct: 0.5, hoursDeficitThreshold: 5.0, hoursDeductionPct: 0.5, earlyThresholdMinutes: 5, isDefault: true },
  });
  console.log("✓ Commission rule");
  console.log("\n🎉 Seed complete!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
