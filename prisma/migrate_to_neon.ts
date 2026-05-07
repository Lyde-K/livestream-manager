// Migrates all data from local dev.db (SQLite) → Neon PostgreSQL.
// Run: npx tsx prisma/migrate_to_neon.ts
// Safe to re-run — uses INSERT ... ON CONFLICT DO NOTHING throughout.

import Database from "better-sqlite3";
import { neon } from "@neondatabase/serverless";
import path from "path";
import { config } from "dotenv";

config();

const DB_PATH = path.resolve(process.cwd(), "dev.db");
const sql = neon(process.env.DATABASE_URL!);

const bool = (v: unknown) => v === 1 || v === true;
const dt   = (v: unknown) => v ? new Date(v as string).toISOString() : null;

async function main() {
  const db = new Database(DB_PATH, { readonly: true });
  console.log(`Reading from: ${DB_PATH}`);
  console.log(`Writing to:   Neon\n`);

  // ── 1. CommissionRule ──────────────────────────────────────────────────────
  const rules = db.prepare("SELECT * FROM CommissionRule").all() as any[];
  for (const r of rules) {
    await sql`
      INSERT INTO "CommissionRule"
        (id, name, "lateSessionsThreshold", "lateDeductionPct",
         "hoursDeficitThreshold", "hoursDeductionPct", "earlyThresholdMinutes", "isDefault")
      VALUES (${r.id}, ${r.name}, ${r.lateSessionsThreshold}, ${r.lateDeductionPct},
              ${r.hoursDeficitThreshold}, ${r.hoursDeductionPct}, ${r.earlyThresholdMinutes},
              ${bool(r.isDefault)})
      ON CONFLICT (id) DO NOTHING`;
  }
  console.log(`✓ CommissionRule  ${rules.length}`);

  // ── 2. Room ────────────────────────────────────────────────────────────────
  const rooms = db.prepare("SELECT * FROM Room").all() as any[];
  for (const r of rooms) {
    await sql`
      INSERT INTO "Room" (id, name, "isActive", notes)
      VALUES (${r.id}, ${r.name}, ${bool(r.isActive)}, ${r.notes ?? null})
      ON CONFLICT (id) DO NOTHING`;
  }
  console.log(`✓ Room            ${rooms.length}`);

  // ── 3. User ────────────────────────────────────────────────────────────────
  const users = db.prepare("SELECT * FROM User").all() as any[];
  for (const u of users) {
    await sql`
      INSERT INTO "User" (id, email, name, password, role, "createdAt", "updatedAt")
      VALUES (${u.id}, ${u.email}, ${u.name}, ${u.password}, ${u.role},
              ${dt(u.createdAt)}, ${dt(u.updatedAt)})
      ON CONFLICT (id) DO NOTHING`;
  }
  console.log(`✓ User            ${users.length}`);

  // ── 4. Client ──────────────────────────────────────────────────────────────
  const clients = db.prepare("SELECT * FROM Client").all() as any[];
  for (const c of clients) {
    await sql`
      INSERT INTO "Client" (id, "userId")
      VALUES (${c.id}, ${c.userId})
      ON CONFLICT (id) DO NOTHING`;
  }
  console.log(`✓ Client          ${clients.length}`);

  // ── 5. LiveHost ────────────────────────────────────────────────────────────
  const hosts = db.prepare("SELECT * FROM LiveHost").all() as any[];
  for (const h of hosts) {
    await sql`
      INSERT INTO "LiveHost"
        (id, "userId", "displayName", "workingDays", "isActive",
         type, "hourlyRate", "contactNo", "icNo", "bankName", "bankAccount")
      VALUES (${h.id}, ${h.userId}, ${h.displayName}, ${h.workingDays},
              ${bool(h.isActive)}, ${h.type ?? "FULL_TIME"}, ${h.hourlyRate ?? 40},
              ${h.contactNo ?? null}, ${h.icNo ?? null},
              ${h.bankName ?? null}, ${h.bankAccount ?? null})
      ON CONFLICT (id) DO NOTHING`;
  }
  console.log(`✓ LiveHost        ${hosts.length}`);

  // ── 6. Brand ───────────────────────────────────────────────────────────────
  const brands = db.prepare("SELECT * FROM Brand").all() as any[];
  for (const b of brands) {
    await sql`
      INSERT INTO "Brand" (id, name, platform, "clientId", color, "isActive")
      VALUES (${b.id}, ${b.name}, ${b.platform}, ${b.clientId ?? null},
              ${b.color}, ${bool(b.isActive)})
      ON CONFLICT (id) DO NOTHING`;
  }
  console.log(`✓ Brand           ${brands.length}`);

  // ── 7. HostPreference ──────────────────────────────────────────────────────
  const prefs = db.prepare("SELECT * FROM HostPreference").all() as any[];
  for (const p of prefs) {
    await sql`
      INSERT INTO "HostPreference"
        (id, "liveHostId", "preferredSlots", "preferredBrands", "offDays", "updatedAt")
      VALUES (${p.id}, ${p.liveHostId}, ${p.preferredSlots ?? "[]"},
              ${p.preferredBrands ?? "[]"}, ${p.offDays ?? "[]"}, ${dt(p.updatedAt)})
      ON CONFLICT (id) DO NOTHING`;
  }
  console.log(`✓ HostPreference  ${prefs.length}`);

  // ── 8. KPIConfig ───────────────────────────────────────────────────────────
  const kpis = db.prepare("SELECT * FROM KPIConfig").all() as any[];
  for (const k of kpis) {
    await sql`
      INSERT INTO "KPIConfig"
        (id, "liveHostId", "brandId", month, year,
         "tier1KpiNormal", "tier2KpiNormal", "tier1KpiCampaign", "tier2KpiCampaign",
         "baseCommissionRate", "tier1Rate", "tier2Rate")
      VALUES (${k.id}, ${k.liveHostId}, ${k.brandId}, ${k.month}, ${k.year},
              ${k.tier1KpiNormal}, ${k.tier2KpiNormal},
              ${k.tier1KpiCampaign}, ${k.tier2KpiCampaign},
              ${k.baseCommissionRate}, ${k.tier1Rate}, ${k.tier2Rate})
      ON CONFLICT (id) DO NOTHING`;
  }
  console.log(`✓ KPIConfig       ${kpis.length}`);

  // ── 9. UploadBatch ─────────────────────────────────────────────────────────
  const batches = db.prepare("SELECT * FROM UploadBatch").all() as any[];
  for (const b of batches) {
    await sql`
      INSERT INTO "UploadBatch" (id, platform, "fileName", period, "rowCount", "createdAt")
      VALUES (${b.id}, ${b.platform}, ${b.fileName}, ${b.period},
              ${b.rowCount}, ${dt(b.createdAt)})
      ON CONFLICT (id) DO NOTHING`;
  }
  console.log(`✓ UploadBatch     ${batches.length}`);

  // ── 10. ImportedSession ────────────────────────────────────────────────────
  const imported = db.prepare("SELECT * FROM ImportedSession").all() as any[];
  for (const s of imported) {
    await sql`
      INSERT INTO "ImportedSession"
        (id, platform, "rawTitle", "hostName", "startTime",
         "durationSeconds", gmv, "uploadBatchId", "createdAt")
      VALUES (${s.id}, ${s.platform}, ${s.rawTitle}, ${s.hostName ?? null},
              ${dt(s.startTime)}, ${s.durationSeconds}, ${s.gmv},
              ${s.uploadBatchId}, ${dt(s.createdAt)})
      ON CONFLICT (id) DO NOTHING`;
  }
  console.log(`✓ ImportedSession ${imported.length}`);

  // ── 11. Session ────────────────────────────────────────────────────────────
  const sessions = db.prepare("SELECT * FROM Session").all() as any[];
  let done = 0;
  for (const s of sessions) {
    await sql`
      INSERT INTO "Session" (
        id, "roomId", "liveHostId", "brandId", platform,
        "scheduledStart", "scheduledEnd", "isCampaignDay", notes,
        "actualStart", "actualEnd", "actualDurationMinutes",
        gmv, "grossRevenue", "adsCost", status, punctuality,
        viewers, "peakViewers", views, "productClicks", "productImpressions",
        ctr, ctor, "addToCart", "ordersPlaced", "ordersConfirmed",
        "itemsSold", "itemsSoldPlaced", "salesPlaced",
        likes, shares, comments, "newFollowers", "avgViewDurationSec",
        "engagedViewers", "externalRef", "importedSessionId",
        "createdAt", "updatedAt"
      ) VALUES (
        ${s.id}, ${s.roomId}, ${s.liveHostId}, ${s.brandId}, ${s.platform},
        ${dt(s.scheduledStart)}, ${dt(s.scheduledEnd)}, ${bool(s.isCampaignDay)}, ${s.notes ?? null},
        ${dt(s.actualStart)}, ${dt(s.actualEnd)}, ${s.actualDurationMinutes ?? null},
        ${s.gmv ?? null}, ${s.grossRevenue ?? null}, ${s.adsCost ?? null},
        ${s.status}, ${s.punctuality ?? null},
        ${s.viewers ?? null}, ${s.peakViewers ?? null}, ${s.views ?? null},
        ${s.productClicks ?? null}, ${s.productImpressions ?? null},
        ${s.ctr ?? null}, ${s.ctor ?? null}, ${s.addToCart ?? null},
        ${s.ordersPlaced ?? null}, ${s.ordersConfirmed ?? null},
        ${s.itemsSold ?? null}, ${s.itemsSoldPlaced ?? null}, ${s.salesPlaced ?? null},
        ${s.likes ?? null}, ${s.shares ?? null}, ${s.comments ?? null},
        ${s.newFollowers ?? null}, ${s.avgViewDurationSec ?? null},
        ${s.engagedViewers ?? null}, ${s.externalRef ?? null}, ${s.importedSessionId ?? null},
        ${dt(s.createdAt)}, ${dt(s.updatedAt)}
      )
      ON CONFLICT (id) DO NOTHING`;
    done++;
    if (done % 25 === 0) process.stdout.write(`  sessions ${done}/${sessions.length}...\r`);
  }
  console.log(`✓ Session         ${done}            `);

  console.log("\n✅ Migration complete! All data is now in Neon.");
  db.close();
}

main().catch((e) => {
  console.error("\n❌ Migration failed:", e.message);
  process.exit(1);
});
