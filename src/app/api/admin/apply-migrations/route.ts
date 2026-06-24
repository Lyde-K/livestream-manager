import { auth } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";

const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "001_add_hasLivestream",
    sql: `ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "hasLivestream" BOOLEAN NOT NULL DEFAULT true`,
  },
];

export async function POST() {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString)
    return Response.json({ error: "No DATABASE_URL" }, { status: 500 });

  const sql = neon(connectionString);

  // Ensure tracking table exists
  await sql`
    CREATE TABLE IF NOT EXISTS "_sql_migrations" (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const m of MIGRATIONS) {
    const existing = await sql`SELECT 1 FROM "_sql_migrations" WHERE name = ${m.name}`;
    if (existing.length > 0) { skipped.push(m.name); continue; }
    await sql.query(m.sql);
    await sql`INSERT INTO "_sql_migrations" (name) VALUES (${m.name}) ON CONFLICT DO NOTHING`;
    applied.push(m.name);
  }

  return Response.json({ ok: true, applied, skipped });
}
