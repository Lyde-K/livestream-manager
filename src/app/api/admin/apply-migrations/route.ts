import { neon } from "@neondatabase/serverless";
import { NextRequest } from "next/server";

// Intentionally avoids importing prisma/auth — those are broken until this migration runs.
// Protected by ADMIN_MIGRATE_SECRET env var set in Vercel.
// Each migration is an array of individual SQL statements — Neon does not support
// multiple commands in a single prepared-statement call.

const MIGRATIONS: { name: string; statements: string[] }[] = [
  {
    name: "001_add_hasLivestream",
    statements: [
      `ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "hasLivestream" BOOLEAN NOT NULL DEFAULT true`,
    ],
  },
  {
    name: "002_add_google_oauth_to_user",
    statements: [
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleAccessToken"  TEXT`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleRefreshToken" TEXT`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleTokenExpiry"  TIMESTAMPTZ`,
    ],
  },
  {
    name: "003_create_task_tables",
    statements: [
      `CREATE TABLE IF NOT EXISTS "Task" (
        "id"            TEXT PRIMARY KEY,
        "title"         TEXT NOT NULL,
        "description"   TEXT,
        "status"        TEXT NOT NULL DEFAULT 'todo',
        "priority"      TEXT NOT NULL DEFAULT 'medium',
        "dueDate"       TIMESTAMPTZ,
        "createdById"   TEXT REFERENCES "User"(id) ON DELETE SET NULL,
        "googleEventId" TEXT,
        "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS "TaskAssignee" (
        "taskId" TEXT NOT NULL REFERENCES "Task"(id) ON DELETE CASCADE,
        "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
        PRIMARY KEY ("taskId", "userId")
      )`,
      `CREATE TABLE IF NOT EXISTS "TaskComment" (
        "id"        TEXT PRIMARY KEY,
        "taskId"    TEXT NOT NULL REFERENCES "Task"(id) ON DELETE CASCADE,
        "userId"    TEXT REFERENCES "User"(id) ON DELETE SET NULL,
        "content"   TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS "Task_status_idx"         ON "Task"("status")`,
      `CREATE INDEX IF NOT EXISTS "Task_createdById_idx"    ON "Task"("createdById")`,
      `CREATE INDEX IF NOT EXISTS "Task_dueDate_idx"        ON "Task"("dueDate")`,
      `CREATE INDEX IF NOT EXISTS "TaskAssignee_userId_idx" ON "TaskAssignee"("userId")`,
      `CREATE INDEX IF NOT EXISTS "TaskComment_taskId_idx"  ON "TaskComment"("taskId")`,
    ],
  },
  {
    name: "004_add_teams_and_notifications",
    statements: [
      // Team table first so Task FK can reference it
      `CREATE TABLE IF NOT EXISTS "Team" (
        "id"          TEXT PRIMARY KEY,
        "name"        TEXT NOT NULL,
        "description" TEXT,
        "createdById" TEXT REFERENCES "User"(id) ON DELETE SET NULL,
        "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS "TeamMember" (
        "teamId" TEXT NOT NULL REFERENCES "Team"(id) ON DELETE CASCADE,
        "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
        "role"   TEXT NOT NULL DEFAULT 'member',
        PRIMARY KEY ("teamId", "userId")
      )`,
      // Add columns to Task — link first, then teamId with FK inline
      `ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "link" TEXT`,
      `ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "teamId" TEXT REFERENCES "Team"(id) ON DELETE SET NULL`,
      `CREATE TABLE IF NOT EXISTS "Notification" (
        "id"        TEXT PRIMARY KEY,
        "userId"    TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
        "type"      TEXT NOT NULL,
        "title"     TEXT NOT NULL,
        "message"   TEXT NOT NULL,
        "taskId"    TEXT REFERENCES "Task"(id) ON DELETE SET NULL,
        "read"      BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS "Task_teamId_idx"          ON "Task"("teamId")`,
      `CREATE INDEX IF NOT EXISTS "TeamMember_userId_idx"    ON "TeamMember"("userId")`,
      `CREATE INDEX IF NOT EXISTS "Notification_userId_read" ON "Notification"("userId","read")`,
      `CREATE INDEX IF NOT EXISTS "Notification_userId_at"   ON "Notification"("userId","createdAt")`,
    ],
  },
  {
    name: "005_add_labels_and_subtasks",
    statements: [
      `ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "labels" TEXT NOT NULL DEFAULT '[]'`,
      `ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "parentId" TEXT REFERENCES "Task"(id) ON DELETE SET NULL`,
      `CREATE INDEX IF NOT EXISTS "Task_parentId_idx" ON "Task"("parentId")`,
    ],
  },
  {
    name: "006_add_recurrence",
    statements: [
      `ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "recurrence" TEXT`,
      `ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "nextRecurAt" TIMESTAMPTZ`,
      `CREATE INDEX IF NOT EXISTS "Task_nextRecurAt_idx" ON "Task"("nextRecurAt")`,
    ],
  },
  {
    name: "007_replacement_leave",
    statements: [
      `CREATE TABLE IF NOT EXISTS "RLCreditAdjustment" (
        "id"         TEXT PRIMARY KEY,
        "liveHostId" TEXT NOT NULL REFERENCES "LiveHost"(id) ON DELETE CASCADE,
        "date"       TEXT NOT NULL,
        "hours"      DOUBLE PRECISION NOT NULL,
        "reason"     TEXT NOT NULL,
        "addedBy"    TEXT NOT NULL,
        "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS "RLCreditAdj_hostId_idx" ON "RLCreditAdjustment"("liveHostId")`,
      `CREATE INDEX IF NOT EXISTS "RLCreditAdj_date_idx"   ON "RLCreditAdjustment"("date")`,
      `CREATE TABLE IF NOT EXISTS "RLApplication" (
        "id"         TEXT PRIMARY KEY,
        "liveHostId" TEXT NOT NULL REFERENCES "LiveHost"(id) ON DELETE CASCADE,
        "leaveDate"  TEXT NOT NULL,
        "status"     TEXT NOT NULL DEFAULT 'PENDING',
        "notes"      TEXT,
        "adminNote"  TEXT,
        "reviewedBy" TEXT,
        "reviewedAt" TIMESTAMPTZ,
        "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS "RLApp_hostId_idx"    ON "RLApplication"("liveHostId")`,
      `CREATE INDEX IF NOT EXISTS "RLApp_status_idx"    ON "RLApplication"("status")`,
      `CREATE INDEX IF NOT EXISTS "RLApp_leaveDate_idx" ON "RLApplication"("leaveDate")`,
    ],
  },
  {
    name: "008_rl_enhancements",
    statements: [
      `ALTER TABLE "RLApplication" ADD COLUMN IF NOT EXISTS "halfDay"  TEXT`,
      `ALTER TABLE "RLApplication" ADD COLUMN IF NOT EXISTS "category" TEXT`,
      `CREATE TABLE IF NOT EXISTS "RLBlackoutDate" (
        "id"        TEXT PRIMARY KEY,
        "date"      TEXT NOT NULL,
        "reason"    TEXT NOT NULL,
        "createdBy" TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS "RLBlackout_date_idx" ON "RLBlackoutDate"("date")`,
      `CREATE TABLE IF NOT EXISTS "RLAuditLog" (
        "id"          TEXT PRIMARY KEY,
        "liveHostId"  TEXT,
        "action"      TEXT NOT NULL,
        "detail"      TEXT NOT NULL,
        "performedBy" TEXT NOT NULL,
        "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS "RLAudit_hostId_idx"    ON "RLAuditLog"("liveHostId")`,
      `CREATE INDEX IF NOT EXISTS "RLAudit_createdAt_idx" ON "RLAuditLog"("createdAt")`,
    ],
  },
  {
    name: "009_add_task_is_personal",
    statements: [
      `ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "isPersonal" BOOLEAN NOT NULL DEFAULT false`,
      `CREATE INDEX IF NOT EXISTS "Task_isPersonal_idx" ON "Task"("isPersonal")`,
    ],
  },
  {
    name: "010_add_livehosts_permissions",
    statements: [
      `ALTER TABLE "LiveHost" ADD COLUMN IF NOT EXISTS "permissions" JSONB NOT NULL DEFAULT '{}'`,
    ],
  },
  {
    name: "011_add_session_title",
    statements: [
      `ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "title" TEXT`,
    ],
  },
  {
    name: "012_add_brand_kpi_config",
    statements: [
      `CREATE TABLE IF NOT EXISTS "BrandKPIConfig" (
        "id"           TEXT NOT NULL,
        "brandId"      TEXT NOT NULL,
        "month"        INTEGER NOT NULL,
        "year"         INTEGER NOT NULL,
        "plannedHours" INTEGER NOT NULL DEFAULT 0,
        "kpiRate"      DOUBLE PRECISION NOT NULL DEFAULT 1.0,
        "bauTier1"     DOUBLE PRECISION NOT NULL DEFAULT 0,
        "bauTier2"     DOUBLE PRECISION NOT NULL DEFAULT 0,
        "campTier1"    DOUBLE PRECISION NOT NULL DEFAULT 0,
        "campTier2"    DOUBLE PRECISION NOT NULL DEFAULT 0,
        "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "BrandKPIConfig_pkey" PRIMARY KEY ("id")
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "BrandKPIConfig_brandId_month_year_key" ON "BrandKPIConfig"("brandId", "month", "year")`,
      `CREATE INDEX IF NOT EXISTS "BrandKPIConfig_month_year_idx" ON "BrandKPIConfig"("month", "year")`,
      `ALTER TABLE "BrandKPIConfig" ADD CONSTRAINT "BrandKPIConfig_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    ],
  },
  {
    name: "013_add_public_holiday",
    statements: [
      `CREATE TABLE IF NOT EXISTS "PublicHoliday" (
        "id"        TEXT NOT NULL,
        "date"      TEXT NOT NULL,
        "name"      TEXT NOT NULL,
        "year"      INTEGER NOT NULL,
        "month"     INTEGER NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PublicHoliday_pkey" PRIMARY KEY ("id")
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "PublicHoliday_date_key" ON "PublicHoliday"("date")`,
      `CREATE INDEX IF NOT EXISTS "PublicHoliday_year_month_idx" ON "PublicHoliday"("year", "month")`,
    ],
  },
  {
    name: "014_add_brand_kpi_rates",
    statements: [
      `ALTER TABLE "BrandKPIConfig" ADD COLUMN IF NOT EXISTS "kpi1Rate" DOUBLE PRECISION NOT NULL DEFAULT 1.0`,
      `ALTER TABLE "BrandKPIConfig" ADD COLUMN IF NOT EXISTS "kpi2Rate" DOUBLE PRECISION NOT NULL DEFAULT 0.5`,
    ],
  },
];

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const expected = process.env.ADMIN_MIGRATE_SECRET ?? "13media-migrate-2026";
  if (!secret || secret !== expected)
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString)
    return Response.json({ error: "No DATABASE_URL" }, { status: 500 });

  const sql = neon(connectionString);
  const applied: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS "_sql_migrations" (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
  } catch (e) {
    return Response.json({ error: "Failed to create tracking table", detail: String(e) }, { status: 500 });
  }

  for (const m of MIGRATIONS) {
    try {
      const existing = await sql`SELECT 1 FROM "_sql_migrations" WHERE name = ${m.name}`;
      if (existing.length > 0) { skipped.push(m.name); continue; }

      // Run each statement individually — Neon doesn't allow multiple commands per call
      for (const stmt of m.statements) {
        await sql.query(stmt);
      }

      await sql`INSERT INTO "_sql_migrations" (name) VALUES (${m.name}) ON CONFLICT DO NOTHING`;
      applied.push(m.name);
    } catch (e) {
      errors.push(`${m.name}: ${String(e)}`);
    }
  }

  return Response.json({ ok: errors.length === 0, applied, skipped, errors });
}
