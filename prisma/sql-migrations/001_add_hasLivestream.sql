-- Add hasLivestream flag to Brand (missing from Neon DB, added to schema without migration)
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "hasLivestream" BOOLEAN NOT NULL DEFAULT true;
