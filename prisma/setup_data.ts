import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";
import path from "path";

const dbPath = path.resolve(process.cwd(), "dev.db");
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

async function main() {
  // ── 1. Clear old sample brands (no sessions attached) ──
  const oldBrands = ["Tefal", "Shopee Mall", "Mars", "Dettol", "Unicharm"];
  for (const name of oldBrands) {
    const brand = await prisma.brand.findUnique({ where: { name } });
    if (brand) {
      // Only delete if no sessions reference it
      const count = await prisma.session.count({ where: { brandId: brand.id } });
      if (count === 0) {
        await prisma.kPIConfig.deleteMany({ where: { brandId: brand.id } });
        await prisma.brand.delete({ where: { id: brand.id } });
        console.log(`✓ Removed old brand: ${name}`);
      } else {
        console.log(`⚠ Skipped ${name} — has ${count} sessions`);
      }
    }
  }

  // ── 2. Add real brands ──
  const colors = [
    "#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6",
    "#ef4444","#8b5cf6","#06b6d4","#84cc16","#f97316","#14b8a6",
  ];
  const brands = [
    { name: "Enfagrow SG",        platform: "SHOPEE" },
    { name: "Dettol MY",          platform: "TIKTOK" },
    { name: "Mamypoko MY",        platform: "SHOPEE" },
    { name: "Petpet MY",          platform: "SHOPEE" },
    { name: "Sofy MY",            platform: "SHOPEE" },
    { name: "Mamypoko SG",        platform: "SHOPEE" },
    { name: "Mars MY",            platform: "SHOPEE" },
    { name: "Mars MY TikTok",     platform: "TIKTOK" },
    { name: "TEFAL Cookware MY",  platform: "TIKTOK" },
    { name: "TEFAL Linen MY",     platform: "TIKTOK" },
    { name: "TEFAL MY",           platform: "SHOPEE" },
  ];

  for (let i = 0; i < brands.length; i++) {
    const b = brands[i];
    await prisma.brand.upsert({
      where: { name: b.name },
      update: { platform: b.platform },
      create: { name: b.name, platform: b.platform, color: colors[i % colors.length] },
    });
    console.log(`✓ Brand: ${b.name} (${b.platform})`);
  }

  // ── 3. Add live hosts ──
  const hosts = ["Wani", "Nisa", "Ayuni", "Isk", "Syaz", "Alia", "Taufiq"];
  const defaultPassword = await bcrypt.hash("password123", 10);

  for (const name of hosts) {
    const email = `${name.toLowerCase()}@13media.co`;

    // Create or find user
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name, password: defaultPassword, role: "LIVE_HOST" },
    });

    // Create live host profile if not exists
    const existing = await prisma.liveHost.findUnique({ where: { userId: user.id } });
    if (!existing) {
      await prisma.liveHost.create({
        data: {
          userId: user.id,
          displayName: name.toUpperCase(),
          workingDays: 5,
          isActive: true,
        },
      });
      console.log(`✓ Host: ${name} (${email}) — display: ${name.toUpperCase()}`);
    } else {
      console.log(`⚠ Host already exists: ${name}`);
    }
  }

  console.log("\n✅ Setup complete!");
  console.log("   Live host password: password123");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
