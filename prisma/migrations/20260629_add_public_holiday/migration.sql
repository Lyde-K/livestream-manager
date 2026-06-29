-- CreateTable
CREATE TABLE "PublicHoliday" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicHoliday_date_key" ON "PublicHoliday"("date");

-- CreateIndex
CREATE INDEX "PublicHoliday_year_month_idx" ON "PublicHoliday"("year", "month");
