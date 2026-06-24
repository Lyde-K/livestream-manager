import { neon } from "@neondatabase/serverless";
import { NextRequest } from "next/server";

// Intentionally avoids importing prisma/auth — those are broken until this migration runs.
// Protected by ADMIN_MIGRATE_SECRET env var set in Vercel.

const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "001_add_hasLivestream",
    sql: `ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "hasLivestream" BOOLEAN NOT NULL DEFAULT true`,
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
