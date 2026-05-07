import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const email = "kun@13media.co";
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const password = await bcrypt.hash("kun-temp-password", 10);
    user = await prisma.user.create({
      data: { email, name: "Kun Official", password, role: "CLIENT" },
    });
    console.log("Created user:", user.email);
  } else {
    console.log("User already exists:", user.email);
  }

  let client = await prisma.client.findUnique({ where: { userId: user.id } });
  if (!client) {
    client = await prisma.client.create({ data: { userId: user.id } });
    console.log("Created client for user:", user.name);
  }

  const brandName = "Kun Official";
  let brand = await prisma.brand.findUnique({ where: { name: brandName } });
  if (!brand) {
    brand = await prisma.brand.create({
      data: {
        name: brandName,
        platform: "TIKTOK",
        color: "#f97316",
        clientId: client.id,
        hasLivestream: false,
        hasAffiliate: true,
        isActive: true,
      },
    });
    console.log("Created brand:", brand.name, "(affiliate-only)");
  } else {
    brand = await prisma.brand.update({
      where: { id: brand.id },
      data: { hasAffiliate: true, clientId: client.id },
    });
    console.log("Brand exists, ensured hasAffiliate=true:", brand.name);
  }

  console.log("\nDone. brandId:", brand.id);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
