-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'LIVE_HOST',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LiveHost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "workingDays" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "LiveHost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'BOTH',
    "clientId" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Brand_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "liveHostId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'TIKTOK',
    "scheduledStart" DATETIME NOT NULL,
    "scheduledEnd" DATETIME NOT NULL,
    "isCampaignDay" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "actualStart" DATETIME,
    "actualEnd" DATETIME,
    "actualDurationMinutes" INTEGER,
    "gmv" REAL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "punctuality" TEXT,
    "importedSessionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Session_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Session_liveHostId_fkey" FOREIGN KEY ("liveHostId") REFERENCES "LiveHost" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Session_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Session_importedSessionId_fkey" FOREIGN KEY ("importedSessionId") REFERENCES "ImportedSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportedSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "rawTitle" TEXT NOT NULL,
    "hostName" TEXT,
    "startTime" DATETIME NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "gmv" REAL NOT NULL,
    "uploadBatchId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportedSession_uploadBatchId_fkey" FOREIGN KEY ("uploadBatchId") REFERENCES "UploadBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UploadBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "KPIConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "liveHostId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "tier1KpiNormal" REAL NOT NULL DEFAULT 0,
    "tier2KpiNormal" REAL NOT NULL DEFAULT 0,
    "tier1KpiCampaign" REAL NOT NULL DEFAULT 0,
    "tier2KpiCampaign" REAL NOT NULL DEFAULT 0,
    "baseCommissionRate" REAL NOT NULL DEFAULT 0,
    "tier1Rate" REAL NOT NULL DEFAULT 0,
    "tier2Rate" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "KPIConfig_liveHostId_fkey" FOREIGN KEY ("liveHostId") REFERENCES "LiveHost" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "KPIConfig_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'Default',
    "lateSessionsThreshold" INTEGER NOT NULL DEFAULT 5,
    "lateDeductionPct" REAL NOT NULL DEFAULT 0.5,
    "hoursDeficitThreshold" REAL NOT NULL DEFAULT 5.0,
    "hoursDeductionPct" REAL NOT NULL DEFAULT 0.5,
    "earlyThresholdMinutes" INTEGER NOT NULL DEFAULT 5,
    "isDefault" BOOLEAN NOT NULL DEFAULT false
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "LiveHost_userId_key" ON "LiveHost"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_userId_key" ON "Client"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_name_key" ON "Room"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Session_importedSessionId_key" ON "Session"("importedSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "KPIConfig_liveHostId_brandId_month_year_key" ON "KPIConfig"("liveHostId", "brandId", "month", "year");
