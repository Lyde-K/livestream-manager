import { prisma } from "../src/lib/prisma";

async function main() {
  const brands = await prisma.brand.findMany({
    select: {
      id: true,
      name: true,
      hasLivestream: true,
      hasAffiliate: true,
      clientId: true,
      client: { select: { user: { select: { name: true } } } },
    },
    orderBy: { name: "asc" },
  });
  console.log(JSON.stringify(brands, null, 2));
  console.log("Total:", brands.length);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
