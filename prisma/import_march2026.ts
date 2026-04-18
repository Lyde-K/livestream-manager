/**
 * Import March 2026 session data from Excel + add part-time live hosts
 * Run: npx tsx prisma/import_march2026.ts
 */
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";
import path from "path";

// ExcelJS loaded via require to avoid ESM issues
const ExcelJS = require("exceljs");

const dbPath = path.resolve(process.cwd(), "dev.db");
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter } as any);

const EXCEL_PATH =
  "/Users/kelvinleow/Downloads/[March2026] Host Commission.xlsx";

// ── Helper: get cell value from ExcelJS (handles formula cells) ──────────────
function cellVal(cell: any): any {
  if (cell.type === 6) {
    // Formula cell - return result
    return cell.result ?? cell.value?.result ?? null;
  }
  return cell.value;
}

function cellStr(cell: any): string | null {
  const v = cellVal(cell);
  if (v == null) return null;
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

function cellNum(cell: any): number | null {
  const v = cellVal(cell);
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// Convert Excel date/time cell (type=4) to { hour, minute }
function cellTime(cell: any): { hour: number; min: number } {
  const v = cell.value;
  if (v instanceof Date) {
    return { hour: v.getUTCHours(), min: v.getUTCMinutes() };
  }
  if (typeof v === "number") {
    // Fraction of day
    const totalMin = Math.round(v * 24 * 60);
    return { hour: Math.floor(totalMin / 60) % 24, min: totalMin % 60 };
  }
  return { hour: 0, min: 0 };
}

// ── Brand name mapping: Excel (trimmed) → DB ─────────────────────────────────
const BRAND_MAP: Record<string, string> = {
  "DETTOL TT": "Dettol MY",
  "MARS TT": "Mars MY TikTok",
  TEFAL: "TEFAL Cookware MY",       // "TEFAL " trimmed → "TEFAL"
  "TEFAL L": "TEFAL Linen MY",
  "MARS SHP": "Mars MY",
  "ENFAGROW SG": "Enfagrow SG",
  MAMYPOKO: "Mamypoko MY",
  "MAMYPOKO SG": "Mamypoko SG",
  PETPET: "Petpet MY",
  SOFY: "Sofy MY",
  "TEFAL SHP": "TEFAL MY",
};

// ── Part-time host definitions ───────────────────────────────────────────────
const PART_TIME_HOSTS = [
  {
    displayName: "Azam",
    contactNo: "0102817605",
    icNo: "12140022950536",
    bankName: "BANK ISLAM",
    bankAccount: "160102644970",
  },
  {
    displayName: "Liyana",
    contactNo: "01119418396",
    icNo: "990530655078",
    bankName: "MAYBANK",
    bankAccount: "156094493274",
  },
  {
    displayName: "Pina",
    contactNo: "01119597961",
    icNo: "990814105174",
    bankName: "MAYBANK",
    bankAccount: "162059059535",
  },
  {
    displayName: "Izzah",
    contactNo: "01135262609",
    icNo: "990926145082",
    bankName: "BANK ISLAM",
    bankAccount: "14274020066011",
  },
  {
    displayName: "Hanani",
    contactNo: "0189514005",
    icNo: "981022016320",
    bankName: "MAYBANK",
    bankAccount: "162254829485",
  },
  {
    displayName: "Emir",
    contactNo: "0199134001",
    icNo: "40312101035",
    bankName: "MAYBANK",
    bankAccount: "012482006638",
  },
  {
    displayName: "Sue",
    contactNo: "0176971156",
    icNo: "980214107388",
    bankName: "MAYBANK",
    bankAccount: "162731101791",
  },
  {
    displayName: "Farisa",
    contactNo: "0172425826",
    icNo: "041030100434",
    bankName: "MAYBANK",
    bankAccount: "162759187732",
  },
  {
    displayName: "Zah",
    contactNo: "0102334272",
    icNo: "900207145770",
    bankName: "MAYBANK",
    bankAccount: "162227332806",
  },
  {
    displayName: "Norahimah",
    contactNo: "0176829337",
    icNo: "010523101804",
    bankName: "RHB BANK",
    bankAccount: "11208600322383",
  },
];

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);

  // ── 1. Ensure default room exists ──────────────────────────────────────────
  const room = await (prisma as any).room.upsert({
    where: { name: "Main Room" },
    update: {},
    create: { name: "Main Room", isActive: true },
  });
  console.log(`✓ Room: ${room.name} (${room.id})`);

  // ── 2. Build brand lookup map ──────────────────────────────────────────────
  const allBrands = await (prisma as any).brand.findMany();
  const brandByName: Record<string, string> = {};
  for (const b of allBrands) {
    brandByName[b.name.trim()] = b.id;
  }
  console.log(`✓ Loaded ${allBrands.length} brands`);

  // ── 3. Add part-time hosts ─────────────────────────────────────────────────
  const defaultPassword = await bcrypt.hash("password123", 10);
  const hostByDisplay: Record<string, string> = {};

  for (const h of PART_TIME_HOSTS) {
    const email = `${h.displayName.toLowerCase()}@13media.co`;
    const user = await (prisma as any).user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: h.displayName,
        password: defaultPassword,
        role: "LIVE_HOST",
      },
    });

    const existing = await (prisma as any).liveHost.findUnique({
      where: { userId: user.id },
    });

    let liveHost;
    if (!existing) {
      liveHost = await (prisma as any).liveHost.create({
        data: {
          userId: user.id,
          displayName: h.displayName,
          workingDays: 0,
          isActive: true,
          type: "PART_TIME",
          hourlyRate: 40,
          contactNo: h.contactNo,
          icNo: h.icNo,
          bankName: h.bankName,
          bankAccount: h.bankAccount,
        },
      });
      console.log(`✓ Part-time host added: ${h.displayName}`);
    } else {
      liveHost = await (prisma as any).liveHost.update({
        where: { userId: user.id },
        data: {
          type: "PART_TIME",
          hourlyRate: 40,
          contactNo: h.contactNo,
          icNo: h.icNo,
          bankName: h.bankName,
          bankAccount: h.bankAccount,
        },
      });
      console.log(`⚠ Updated: ${h.displayName}`);
    }
    hostByDisplay[h.displayName] = liveHost.id;
  }

  // Load ALL live hosts (full-time + part-time) into lookup
  const allHosts = await (prisma as any).liveHost.findMany({
    include: { user: true },
  });
  for (const h of allHosts) {
    hostByDisplay[h.user.name] = h.id;
    hostByDisplay[h.displayName] = h.id;
  }
  console.log(`✓ ${allHosts.length} hosts loaded`);

  // ── 4. Import TT sessions ──────────────────────────────────────────────────
  const ttSheet = wb.getWorksheet("DATA SHEET (TT)");
  if (!ttSheet) throw new Error("Sheet 'DATA SHEET (TT)' not found");

  let ttImported = 0;
  let ttSkipped = 0;

  for (let r = 2; r <= ttSheet.rowCount; r++) {
    const row = ttSheet.getRow(r);

    const brandRaw = cellStr(row.getCell(1));
    const host = cellStr(row.getCell(2));
    const hours = cellNum(row.getCell(3));
    const campaign = cellStr(row.getCell(4));
    const dateStr = cellStr(row.getCell(5)); // TEXT formula → "DD-MM-YYYY"
    const month = cellStr(row.getCell(6));
    const adsCost = cellNum(row.getCell(7));
    const punctualityRaw = cellStr(row.getCell(9));
    const slotCell = row.getCell(10); // time cell
    const startTimeStr = cellStr(row.getCell(12));
    const durationSec = cellNum(row.getCell(13));
    const grossRevenue = cellNum(row.getCell(14));
    const directGmv = cellNum(row.getCell(15));

    if (month !== "March") continue;
    if (!brandRaw || !host || !dateStr) continue;

    const dbBrandName = BRAND_MAP[brandRaw];
    if (!dbBrandName) {
      if (ttSkipped === 0) console.warn(`  ⚠ Unknown TT brand: "${brandRaw}"`);
      ttSkipped++;
      continue;
    }
    const brandId = brandByName[dbBrandName];
    if (!brandId) {
      if (ttSkipped === 0) console.warn(`  ⚠ Brand not in DB: "${dbBrandName}"`);
      ttSkipped++;
      continue;
    }

    const hostId = hostByDisplay[host];
    if (!hostId) {
      console.warn(`  ⚠ Unknown TT host: "${host}"`);
      ttSkipped++;
      continue;
    }

    // Parse date "DD-MM-YYYY"
    let scheduledStart: Date;
    let actualStart: Date;

    const dateParts = dateStr.split("-").map(Number);
    if (dateParts.length !== 3 || isNaN(dateParts[0])) {
      console.warn(`  ⚠ Bad date at row ${r}: "${dateStr}"`);
      ttSkipped++;
      continue;
    }
    const [d, m2, y] = dateParts;
    const { hour: slotHour, min: slotMin } = cellTime(slotCell);
    scheduledStart = new Date(y, m2 - 1, d, slotHour, slotMin, 0);

    if (startTimeStr) {
      actualStart = new Date(startTimeStr.replace(" ", "T") + ":00");
      if (isNaN(actualStart.getTime())) actualStart = scheduledStart;
    } else {
      actualStart = scheduledStart;
    }

    const durationMinutes = durationSec
      ? Math.round(durationSec / 60)
      : Math.round((hours || 0) * 60);
    const actualEnd = new Date(actualStart.getTime() + durationMinutes * 60_000);
    const scheduledEnd = new Date(scheduledStart.getTime() + durationMinutes * 60_000);

    const punctuality =
      punctualityRaw === "Yes" ? "ON_TIME" : punctualityRaw === "No" ? "LATE" : null;
    const isCampaignDay = campaign?.toLowerCase() === "campaign";

    const uniqueKey = `TT-${dateStr}-${host}-${brandRaw}-${slotHour}:${slotMin}`;

    try {
      await (prisma as any).session.upsert({
        where: { externalRef: uniqueKey },
        update: {
          gmv: directGmv,
          grossRevenue,
          adsCost,
          actualDurationMinutes: durationMinutes,
          punctuality,
          status: "COMPLETED",
        },
        create: {
          roomId: room.id,
          liveHostId: hostId,
          brandId,
          platform: "TIKTOK",
          scheduledStart,
          scheduledEnd,
          actualStart,
          actualEnd,
          actualDurationMinutes: durationMinutes,
          gmv: directGmv,
          grossRevenue,
          adsCost,
          status: "COMPLETED",
          punctuality,
          isCampaignDay,
          externalRef: uniqueKey,
        },
      });
      ttImported++;
    } catch (e: any) {
      console.warn(`  ⚠ TT row ${r} error: ${e.message}`);
      ttSkipped++;
    }
  }

  console.log(`✓ TT: ${ttImported} imported, ${ttSkipped} skipped`);

  // ── 5. Import SHP sessions ─────────────────────────────────────────────────
  const shpSheet = wb.getWorksheet("DATA SHEET (SHP)");
  if (!shpSheet) throw new Error("Sheet 'DATA SHEET (SHP)' not found");

  let shpImported = 0;
  let shpSkipped = 0;

  for (let r = 2; r <= shpSheet.rowCount; r++) {
    const row = shpSheet.getRow(r);

    const brandRaw = cellStr(row.getCell(1));
    const host = cellStr(row.getCell(2));
    const hours = cellNum(row.getCell(3));
    const campaign = cellStr(row.getCell(4));
    const dateStr = cellStr(row.getCell(5));
    const month = cellStr(row.getCell(6));
    const punctualityRaw = cellStr(row.getCell(7));
    const slotCell = row.getCell(8);
    const startTimeCell = row.getCell(10);
    const durationCell = row.getCell(11);
    const gmvRaw = cellNum(row.getCell(22)); // Sales(Confirmed Order)

    if (month !== "March") continue;
    if (!brandRaw || !host || !dateStr) continue;

    const dbBrandName = BRAND_MAP[brandRaw];
    if (!dbBrandName) {
      console.warn(`  ⚠ Unknown SHP brand: "${brandRaw}"`);
      shpSkipped++;
      continue;
    }
    const brandId = brandByName[dbBrandName];
    if (!brandId) {
      console.warn(`  ⚠ Brand not in DB: "${dbBrandName}"`);
      shpSkipped++;
      continue;
    }

    const hostId = hostByDisplay[host];
    if (!hostId) {
      console.warn(`  ⚠ Unknown SHP host: "${host}"`);
      shpSkipped++;
      continue;
    }

    const dateParts = dateStr.split("-").map(Number);
    if (dateParts.length !== 3 || isNaN(dateParts[0])) {
      console.warn(`  ⚠ Bad SHP date at row ${r}: "${dateStr}"`);
      shpSkipped++;
      continue;
    }
    const [d, m2, y] = dateParts;
    const { hour: slotHour, min: slotMin } = cellTime(slotCell);
    const scheduledStart = new Date(y, m2 - 1, d, slotHour, slotMin, 0);

    let actualStart: Date;
    const startVal = startTimeCell.value;
    if (startVal instanceof Date) {
      actualStart = startVal;
    } else if (typeof startVal === "string") {
      actualStart = new Date(startVal);
      if (isNaN(actualStart.getTime())) actualStart = scheduledStart;
    } else {
      actualStart = scheduledStart;
    }

    // Duration from col 11 (time value = HH:MM:SS fraction of day)
    let durationMinutes: number;
    const durVal = durationCell.value;
    if (durVal instanceof Date) {
      durationMinutes = durVal.getUTCHours() * 60 + durVal.getUTCMinutes();
    } else if (typeof durVal === "number") {
      durationMinutes = Math.round(durVal * 24 * 60);
    } else {
      durationMinutes = Math.round((hours || 0) * 60);
    }

    const actualEnd = new Date(actualStart.getTime() + durationMinutes * 60_000);
    const scheduledEnd = new Date(scheduledStart.getTime() + durationMinutes * 60_000);

    const punctuality =
      punctualityRaw === "Yes" ? "ON_TIME" : punctualityRaw === "No" ? "LATE" : null;
    const isCampaignDay = campaign?.toLowerCase() === "campaign";

    const uniqueKey = `SHP-${dateStr}-${host}-${brandRaw}-${slotHour}:${slotMin}`;

    try {
      await (prisma as any).session.upsert({
        where: { externalRef: uniqueKey },
        update: {
          gmv: gmvRaw,
          actualDurationMinutes: durationMinutes,
          punctuality,
          status: "COMPLETED",
        },
        create: {
          roomId: room.id,
          liveHostId: hostId,
          brandId,
          platform: "SHOPEE",
          scheduledStart,
          scheduledEnd,
          actualStart,
          actualEnd,
          actualDurationMinutes: durationMinutes,
          gmv: gmvRaw,
          status: "COMPLETED",
          punctuality,
          isCampaignDay,
          externalRef: uniqueKey,
        },
      });
      shpImported++;
    } catch (e: any) {
      console.warn(`  ⚠ SHP row ${r} error: ${e.message}`);
      shpSkipped++;
    }
  }

  console.log(`✓ SHP: ${shpImported} imported, ${shpSkipped} skipped`);

  const total = await (prisma as any).session.count();
  console.log(`\n✅ Done! ${total} total sessions in DB`);
  console.log(`   TT: ${ttImported} | SHP: ${shpImported}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
