import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";
import { format } from "date-fns";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return new Response("Forbidden", { status: 403 });

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  const where: Record<string, unknown> = {};
  if (start && end) {
    where.scheduledStart = { gte: new Date(start), lte: new Date(end) };
  } else if (start) {
    where.scheduledStart = { gte: new Date(start) };
  }

  const sessions = await prisma.session.findMany({
    where,
    include: {
      room: true,
      brand: true,
      liveHost: { include: { user: { select: { name: true } } } },
    },
    orderBy: { scheduledStart: "asc" },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sessions");

  // Freeze the header row
  ws.views = [{ state: "frozen", ySplit: 3 }];

  // Header fills
  const headerFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3730A3" } };
  const idFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
  const readonlyFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };

  // Title row
  ws.mergeCells("A1:N1");
  ws.getCell("A1").value = start && end
    ? `Sessions Export — ${format(new Date(start), "dd MMM yyyy")} to ${format(new Date(end), "dd MMM yyyy")}`
    : "Sessions Export";
  ws.getCell("A1").font = { bold: true, size: 13, color: { argb: "FF1E1B4B" } };
  ws.getCell("A1").alignment = { horizontal: "center" };
  ws.getRow(1).height = 26;

  // Instructions row
  ws.mergeCells("A2:N2");
  ws.getCell("A2").value = "✏️  To update: amend Date / Start / End / Host ID / Brand ID / Room ID / Platform / Campaign Day / Notes — then re-upload via Schedule → Import Excel. Blue columns are IDs for matching.";
  ws.getCell("A2").font = { size: 10, color: { argb: "FF4B5563" }, italic: true };
  ws.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7ED" } };
  ws.getRow(2).height = 18;

  // Column headers
  const headers = [
    { label: "Session ID", key: "id", width: 28, editable: false },
    { label: "Date", key: "date", width: 14, editable: true },
    { label: "Start Time", key: "startTime", width: 12, editable: true },
    { label: "End Time", key: "endTime", width: 12, editable: true },
    { label: "Host Name", key: "hostName", width: 18, editable: false },
    { label: "Host ID", key: "hostId", width: 28, editable: true },
    { label: "Brand Name", key: "brandName", width: 18, editable: false },
    { label: "Brand ID", key: "brandId", width: 28, editable: true },
    { label: "Room Name", key: "roomName", width: 14, editable: false },
    { label: "Room ID", key: "roomId", width: 28, editable: true },
    { label: "Platform", key: "platform", width: 12, editable: true },
    { label: "Campaign Day", key: "isCampaignDay", width: 14, editable: true },
    { label: "Notes", key: "notes", width: 32, editable: true },
    { label: "Status", key: "status", width: 12, editable: false },
  ];

  const headerRow = ws.getRow(3);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h.label;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = headerFill;
    cell.border = { bottom: { style: "thin", color: { argb: "FF6366F1" } } };
  });
  headerRow.height = 22;

  // Set column widths
  headers.forEach((h, i) => { ws.getColumn(i + 1).width = h.width; });

  // Data rows
  const ID_COLS = [1, 6, 8, 10]; // Session ID, Host ID, Brand ID, Room ID columns (1-indexed)
  const READONLY_COLS = [1, 5, 7, 9, 14]; // Session ID, Host Name, Brand Name, Room Name, Status

  sessions.forEach((s) => {
    const rowIdx = ws.rowCount + 1;
    const dataRow = ws.getRow(rowIdx);

    const startDt = new Date(s.scheduledStart);
    const endDt = new Date(s.scheduledEnd);

    dataRow.values = [
      s.id,
      format(startDt, "yyyy-MM-dd"),
      format(startDt, "HH:mm"),
      format(endDt, "HH:mm"),
      s.liveHost.user.name,
      s.liveHostId,
      s.brand.name,
      s.brandId,
      s.room.name,
      s.roomId,
      s.platform,
      s.isCampaignDay ? "Yes" : "No",
      s.notes ?? "",
      s.status,
    ];

    dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.alignment = { vertical: "middle", wrapText: false };
      if (ID_COLS.includes(colNumber)) {
        cell.fill = idFill;
        cell.font = { size: 10, color: { argb: "FF4338CA" }, name: "Courier New" };
      } else if (READONLY_COLS.includes(colNumber)) {
        cell.fill = readonlyFill;
        cell.font = { size: 10, color: { argb: "FF6B7280" } };
      } else {
        cell.font = { size: 10.5 };
      }
    });

    dataRow.height = 18;
  });

  // Auto-filter
  ws.autoFilter = { from: "A3", to: `N3` };

  const buf = await wb.xlsx.writeBuffer();
  const filename = start
    ? `sessions-${format(new Date(start), "yyyy-MM-dd")}.xlsx`
    : `sessions-export.xlsx`;

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
