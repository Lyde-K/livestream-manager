import { neon } from "@neondatabase/serverless";
import { NextRequest } from "next/server";

// Intentionally avoids importing prisma/auth — those are broken until this migration runs.
// Protected by ADMIN_MIGRATE_SECRET env var set in Vercel.

const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "001_add_hasLivestream",
    sql: `ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "hasLivestream" BOOLEAN NOT NULL DEFAULT true`,
  },
  {
    name: "002_add_google_oauth_to_user",
    sql: `
      ALTER TABLE "User"
        ADD COLUMN IF NOT EXISTS "googleAccessToken"  TEXT,
        ADD COLUMN IF NOT EXISTS "googleRefreshToken" TEXT,
        ADD COLUMN IF NOT EXISTS "googleTokenExpiry"  TIMESTAMPTZ
    `,
  },
  {
    name: "003_create_task_tables",
    sql: `
      CREATE TABLE IF NOT EXISTS "Task" (
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
      );
      CREATE TABLE IF NOT EXISTS "TaskAssignee" (
        "taskId" TEXT NOT NULL REFERENCES "Task"(id) ON DELETE CASCADE,
        "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
        PRIMARY KEY ("taskId", "userId")
      );
      CREATE TABLE IF NOT EXISTS "TaskComment" (
        "id"        TEXT PRIMARY KEY,
        "taskId"    TEXT NOT NULL REFERENCES "Task"(id) ON DELETE CASCADE,
        "userId"    TEXT REFERENCES "User"(id) ON DELETE SET NULL,
        "content"   TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "Task_status_idx"      ON "Task"("status");
      CREATE INDEX IF NOT EXISTS "Task_createdById_idx" ON "Task"("createdById");
      CREATE INDEX IF NOT EXISTS "Task_dueDate_idx"     ON "Task"("dueDate");
      CREATE INDEX IF NOT EXISTS "TaskAssignee_userId_idx" ON "TaskAssignee"("userId");
      CREATE INDEX IF NOT EXISTS "TaskComment_taskId_idx" ON "TaskComment"("taskId")
    `,
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
      await sql.query(m.sql);
      await sql`INSERT INTO "_sql_migrations" (name) VALUES (${m.name}) ON CONFLICT DO NOTHING`;
      applied.push(m.name);
    } catch (e) {
      errors.push(`${m.name}: ${String(e)}`);
    }
  }

  return Response.json({ ok: errors.length === 0, applied, skipped, errors });
}
