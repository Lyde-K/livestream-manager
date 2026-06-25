import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";

const MYT_OFFSET = 8 * 60; // UTC+8 in minutes

function toMYT(date: Date) {
  return new Date(date.getTime() + MYT_OFFSET * 60_000);
}

function mytFormat(date: Date, part: "month" | "day" | "date" | "time"): string {
  const d = toMYT(date);
  if (part === "month") return d.toLocaleString("en-MY", { month: "long", timeZone: "Asia/Kuala_Lumpur" });
  if (part === "day")   return d.toLocaleString("en-MY", { weekday: "long", timeZone: "Asia/Kuala_Lumpur" });
  if (part === "date")  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  if (part === "time")  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return "";
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end   = searchParams.get("end");

  const user = session.user as { id: string; role: string };
  const where: Record<string, unknown> = {};
  if (start && end) where.scheduledStart = { gte: new Date(start), lte: new Date(end) };

  if (user.role === "CLIENT") {
    const client = await prisma.client.findUnique({ where: { userId: user.id }, include: { brands: true } });
    if (client) where.brandId = { in: client.brands.map((b) => b.id) };
  }

  const [sessions, campaigns] = await Promise.all([
    prisma.session.findMany({
      where,
      include: { brand: true, liveHost: { include: { user: true } } },
      orderBy: { scheduledStart: "asc" },
    }),
    // Fetch all campaigns in the range to match against sessions
    prisma.campaign.findMany({
      where: start && end ? {
        startDate: { lte: new Date(end) },
        endDate:   { gte: new Date(start) },
      } : {},
    }),
  ]);

  // Build campaign lookup: brandId+platform+month → campaign name
  function findCampaign(brandId: string, platform: string, monthIndex: number, year: number): string {
    const match = campaigns.find(c =>
      (c.brandId === brandId || c.brandId === null) &&
      (c.platform === platform || c.platform === "BOTH") &&
      c.month === monthIndex + 1 &&
      c.year === year
    );
    return match?.name ?? "BAU";
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Schedule");

  // Header row styling
  const headerFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  const headers = ["Campaign", "Month", "Day", "Date", "Time Start", "Duration", "Host", "GMV", "Status"];
  const colWidths = [24, 12, 12, 10, 12, 10, 20, 12, 12];

  ws.getRow(1).values = headers;
  ws.getRow(1).eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF334155" } },
    };
  });
  ws.getRow(1).height = 24;
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // Data rows
  sessions.forEach((s, i) => {
    const myt   = toMYT(new Date(s.scheduledStart));
    const month = myt.getUTCMonth();
    const year  = myt.getUTCFullYear();

    const durationMs  = new Date(s.scheduledEnd).getTime() - new Date(s.scheduledStart).getTime();
    const durationHrs = Math.round(durationMs / 3_600_000);

    const gmv = s.gmv != null ? `RM${s.gmv.toFixed(2)}` : "RM0.00";

    const row = ws.getRow(2 + i);
    row.values = [
      findCampaign(s.brandId, s.platform, month, year),
      mytFormat(new Date(s.scheduledStart), "month"),
      mytFormat(new Date(s.scheduledStart), "day"),
      mytFormat(new Date(s.scheduledStart), "date"),
      mytFormat(new Date(s.scheduledStart), "time"),
      durationHrs,
      s.liveHost?.user.name ?? "",
      gmv,
      s.status,
    ];

    // Alternating row fill
    if (i % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFF" } };
      });
    }

    row.eachCell((cell) => {
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
    // Left-align Campaign and Host
    row.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
    row.getCell(7).alignment = { horizontal: "left", vertical: "middle" };

    row.height = 20;
  });

  // Freeze header row
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // Auto-filter on header row
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  const monthLabel = start ? toMYT(new Date(start)).toLocaleString("en-MY", { month: "long", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }) : "export";

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="schedule-${monthLabel}.xlsx"`,
    },
  });
}
