CREATE TABLE "BrandKPIConfig" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "plannedHours" INTEGER NOT NULL DEFAULT 0,
    "kpiRate" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "bauTier1" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bauTier2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "campTier1" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "campTier2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BrandKPIConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BrandKPIConfig_brandId_month_year_key" ON "BrandKPIConfig"("brandId", "month", "year");
CREATE INDEX "BrandKPIConfig_month_year_idx" ON "BrandKPIConfig"("month", "year");
ALTER TABLE "BrandKPIConfig" ADD CONSTRAINT "BrandKPIConfig_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
