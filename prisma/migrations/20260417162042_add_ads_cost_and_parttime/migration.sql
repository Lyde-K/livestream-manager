-- AlterTable
ALTER TABLE "Session" ADD COLUMN "adsCost" REAL;
ALTER TABLE "Session" ADD COLUMN "grossRevenue" REAL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LiveHost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "workingDays" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "type" TEXT NOT NULL DEFAULT 'FULL_TIME',
    "hourlyRate" REAL NOT NULL DEFAULT 40,
    "contactNo" TEXT,
    "icNo" TEXT,
    "bankName" TEXT,
    "bankAccount" TEXT,
    CONSTRAINT "LiveHost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LiveHost" ("displayName", "id", "isActive", "userId", "workingDays") SELECT "displayName", "id", "isActive", "userId", "workingDays" FROM "LiveHost";
DROP TABLE "LiveHost";
ALTER TABLE "new_LiveHost" RENAME TO "LiveHost";
CREATE UNIQUE INDEX "LiveHost_userId_key" ON "LiveHost"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
