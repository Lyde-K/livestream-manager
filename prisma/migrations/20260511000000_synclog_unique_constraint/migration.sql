-- Add updatedAt column to SyncLog
ALTER TABLE "SyncLog" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add unique constraint to prevent duplicate sync error logs
-- skipDuplicates in createMany will now silently ignore re-inserts of the same error
ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_platform_rawHost_rawBrand_startTime_errorType_key" UNIQUE (platform, "rawHost", "rawBrand", "startTime", "errorType");
