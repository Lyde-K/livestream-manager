/**
 * Lightweight SQL migration runner for Neon DB.
 * Runs on every Vercel build (before `next build`).
 * Tracks applied migrations in a "_sql_migrations" table so each file runs only once.
 * All migration files must be idempotent (use IF NOT EXISTS / IF EXISTS).
 */
import { neon } from "@neondatabase/serverless";
import { readdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "sql-migrations");

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log("[migrate] No DATABASE_URL — skipping (local dev without DB).");
    return;
  }

  const sql = neon(connectionString);

  // Ensure tracking table exists
  await sql.query(`
    CREATE TABLE IF NOT EXISTS "_sql_migrations" (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Read migration files sorted by name
  const files = (await readdir(MIGRATIONS_DIR))
    .filter(f => f.endsWith(".sql"))
    .sort();

  // Fetch already-applied migrations
  const rows = await sql.query(`SELECT name FROM "_sql_migrations"`);
  const applied = new Set(rows.map(r => r.name));

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const content = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    console.log(`[migrate] Applying: ${file}`);
    await sql.query(content);
    await sql.query(`INSERT INTO "_sql_migrations" (name) VALUES ($1) ON CONFLICT DO NOTHING`, [file]);
    ran++;
  }

  if (ran === 0) console.log("[migrate] All migrations already applied — nothing to do.");
  else console.log(`[migrate] Applied ${ran} migration(s) successfully.`);
}

run().catch(err => {
  console.error("[migrate] FAILED:", err.message ?? err);
  process.exit(1);
});
