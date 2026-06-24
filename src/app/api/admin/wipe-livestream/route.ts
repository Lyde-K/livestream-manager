import { neon } from "@neondatabase/serverless";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const expected = process.env.ADMIN_MIGRATE_SECRET ?? "13media-migrate-2026";
  if (!secret || secret !== expected)
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString)
    return Response.json({ error: "No DATABASE_URL" }, { status: 500 });

  const sql = neon(connectionString);

  const counts: Record<string, number> = {};
  try {
    const tables = [
      "NarrationLog",
      "SessionInsight",
      "SyncLog",
      "ImportedSession",
      "Session",
    ];
    for (const table of tables) {
      const result = await sql(`DELETE FROM "${table}"`) as { rowCount?: number } | undefined;
      counts[table] = (result as { rowCount?: number })?.rowCount ?? 0;
    }
    return Response.json({ ok: true, deleted: counts });
  } catch (e) {
    return Response.json({ error: String(e), deleted: counts }, { status: 500 });
  }
}
