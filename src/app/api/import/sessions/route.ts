import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";

interface RowResult {
  row: number;
  action: "created" | "updated" | "skipped";
  id?: string;
  reason?: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  const wb = new ExcelJS.Workbook();
  // ExcelJS v4 types predate the Node.js generic Buffer<T> — suppress the mismatch
  // @ts-expect-error ExcelJS Buffer type incompatibility with @types/node >=20
  await wb.xlsx.load(Buffer.from(await file.arrayBuffer()));

  const ws = wb.getWorksheet("Sessions");
  if (!ws) return Response.json({ error: "Worksheet 'Sessions' not found. Please use the exported template." }, { status: 400 });

  // Row 3 is the header, data starts at row 4
  const results: RowResult[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  const rows = ws.getRows(4, ws.rowCount - 3) ?? [];

  for (const row of rows) {
    const rowNum = row.number;

    // Read cells
    const sessionId = String(row.getCell(1).value ?? "").trim();
    const dateStr = String(row.getCell(2).value ?? "").trim();
    const startTimeStr = String(row.getCell(3).value ?? "").trim();
    const endTimeStr = String(row.getCell(4).value ?? "").trim();
    // col 5 = Host Name (ignored, col 6 = Host ID)
    const hostId = String(row.getCell(6).value ?? "").trim();
    // col 7 = Brand Name (ignored, col 8 = Brand ID)
    const brandId = String(row.getCell(8).value ?? "").trim();
    // col 9 = Room Name (ignored, col 10 = Room ID)
    const roomId = String(row.getCell(10).value ?? "").trim();
    const platform = String(row.getCell(11).value ?? "").trim().toUpperCase();
    const campaignDayRaw = String(row.getCell(12).value ?? "").trim().toLowerCase();
    const notes = String(row.getCell(13).value ?? "").trim();
    // col 14 = Status (read-only, ignored)

    // Skip empty rows
    if (!dateStr && !sessionId) {
      skipped++;
      continue;
    }

    // Validate required fields
    if (!dateStr || !startTimeStr || !endTimeStr) {
      results.push({ row: rowNum, action: "skipped", reason: "Missing date or time" });
      skipped++;
      continue;
    }

    // Parse datetime as MYT (UTC+8) — append +08:00 so JS doesn't treat as local/UTC
    const scheduledStart = new Date(`${dateStr}T${startTimeStr}:00+08:00`);
    const scheduledEnd   = new Date(`${dateStr}T${endTimeStr}:00+08:00`);

    // Handle sessions ending past midnight MYT (e.g., 01:00 end < 10:00 start → next day)
    if (scheduledEnd <= scheduledStart) {
      scheduledEnd.setTime(scheduledEnd.getTime() + 24 * 3_600_000);
    }

    if (isNaN(scheduledStart.getTime()) || isNaN(scheduledEnd.getTime())) {
      results.push({ row: rowNum, action: "skipped", reason: "Invalid date/time format. Use YYYY-MM-DD and HH:mm" });
      skipped++;
      continue;
    }

    if (!hostId || !brandId || !roomId) {
      results.push({ row: rowNum, action: "skipped", reason: "Missing Host ID, Brand ID, or Room ID" });
      skipped++;
      continue;
    }

    const isCampaignDay = campaignDayRaw === "yes" || campaignDayRaw === "true" || campaignDayRaw === "1";
    const finalPlatform = ["TIKTOK", "SHOPEE"].includes(platform) ? platform : "TIKTOK";

    const data = {
      scheduledStart,
      scheduledEnd,
      liveHostId: hostId,
      brandId,
      roomId,
      platform: finalPlatform,
      isCampaignDay,
      notes: notes || null,
    };

    // Update if session ID provided and exists, otherwise create
    if (sessionId && sessionId !== "undefined") {
      const existing = await prisma.session.findUnique({ where: { id: sessionId } });
      if (existing) {
        await prisma.session.update({ where: { id: sessionId }, data });
        results.push({ row: rowNum, action: "updated", id: sessionId });
        updated++;
      } else {
        // ID not found — create new
        const created_ = await prisma.session.create({ data });
        results.push({ row: rowNum, action: "created", id: created_.id });
        created++;
      }
    } else {
      // No ID → new session
      const created_ = await prisma.session.create({ data });
      results.push({ row: rowNum, action: "created", id: created_.id });
      created++;
    }
  }

  return Response.json({
    ok: true,
    summary: { created, updated, skipped, total: created + updated + skipped },
    results: results.filter((r) => r.action !== "updated" || r.reason), // surface all creates + errors
  });
}
