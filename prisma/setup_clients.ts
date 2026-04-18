/**
 * Create client accounts and link brands to companies per org chart.
 * Run: npx tsx prisma/setup_clients.ts
 */
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";
import path from "path";

const dbPath = path.resolve(process.cwd(), "dev.db");
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter } as any);

const CLIENT_MAP = [
  { company: "Reckitt SG",          email: "reckitt-sg@13media.co",   brands: ["Enfagrow SG"] },
  { company: "Reckitt MY",          email: "reckitt-my@13media.co",   brands: ["Dettol MY"] },
  { company: "Unicharm",            email: "unicharm@13media.co",     brands: ["Mamypoko MY", "Petpet MY", "Sofy MY"] },
  { company: "Unicharm SG",         email: "unicharm-sg@13media.co",  brands: ["Mamypoko SG"] },
  { company: "Mars",                email: "mars@13media.co",         brands: ["Mars MY", "Mars MY TikTok"] },
  { company: "Groupe Seb Malaysia", email: "groupeseb@13media.co",    brands: ["TEFAL Cookware MY", "TEFAL Linen MY", "TEFAL MY"] },
];

async function main() {
  const defaultPassword = await bcrypt.hash("client123", 10);

  for (const entry of CLIENT_MAP) {
    const user = await (prisma as any).user.upsert({
      where: { email: entry.email },
      update: { name: entry.company },
      create: { email: entry.email, name: entry.company, password: defaultPassword, role: "CLIENT" },
    });

    const client = await (prisma as any).client.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });

    let linked = 0;
    for (const brandName of entry.brands) {
      const brand = await (prisma as any).brand.findFirst({ where: { name: brandName } });
      if (!brand) { console.warn(`  ⚠ Brand not found: "${brandName}"`); continue; }
      await (prisma as any).brand.update({ where: { id: brand.id }, data: { clientId: client.id } });
      linked++;
    }
    console.log(`✓ ${entry.company} → ${linked} brand(s) linked`);
  }

  const brands = await (prisma as any).brand.findMany({
    include: { client: { include: { user: true } } },
    orderBy: { name: "asc" },
  });
  console.log("\n── Brand → Client ──────────────────────────────────────");
  for (const b of brands) {
    console.log(`  ${b.name.padEnd(24)} → ${b.client?.user?.name || "(unassigned)"}`);
  }
  console.log("\n✅ Done! Client login password: client123");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
