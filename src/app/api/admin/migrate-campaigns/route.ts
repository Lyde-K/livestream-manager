import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Campaign" (
      "id"        TEXT NOT NULL,
      "name"      TEXT NOT NULL,
      "platform"  TEXT NOT NULL,
      "startDate" TIMESTAMP(3) NOT NULL,
      "endDate"   TIMESTAMP(3) NOT NULL,
      "month"     INTEGER NOT NULL,
      "year"      INTEGER NOT NULL,
      "brandId"   TEXT,
      "notes"     TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Campaign_month_year_idx" ON "Campaign"("month", "year");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Campaign_platform_idx" ON "Campaign"("platform");
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Campaign_brandId_fkey'
      ) THEN
        ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_brandId_fkey"
          FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  return Response.json({ ok: true, message: "Campaign table ready" });
}
