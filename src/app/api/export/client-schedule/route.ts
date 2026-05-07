import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";
import { format } from "date-fns";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  const user = session.user as { id: string; role: string };
  const where: Record<string, unknown> = {};
  if (start && end) where.scheduledStart = { gte: new Date(start), lte: new Date(end) };

  if (user.role === "CLIENT") {
    const client = await prisma.client.findUnique({ where: { userId: user.id }, include: { brands: true } });
    if (client) where.brandId = { in: client.brands.map((b) => b.id) };
  }

  const sessions = await prisma.session.findMany({
    where,
    include: { room: true, brand: true, liveHost: { include: { user: true } } },
    orderBy: { scheduledStart: "asc" },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Schedule");
  const headerFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3730A3" } };

  ws.mergeCells("A1:H1");
  ws.getCell("A1").value = `Livestream Schedule — ${start ? format(new Date(start), "MMM yyyy") : ""}`;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1E1B4B" } };
  ws.getCell("A1").alignment = { horizontal: "center" };
  ws.getRow(1).height = 28;

  ws.getRow(3).values = ["Date", "Start Time", "End Time", "Host", "Brand", "Platform", "Room", "Status"];
  ws.getRow(3).eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  ws.getRow(3).height = 22;

  sessions.forEach((s, i) => {
    const row = ws.getRow(4 + i);
    row.values = [
      format(new Date(s.scheduledStart), "dd MMM yyyy"),
      format(new Date(s.scheduledStart), "HH:mm"),
      format(new Date(s.scheduledEnd), "HH:mm"),
      s.liveHost?.user.name ?? "Unassigned",
      s.brand.name,
      s.platform,
      s.room?.name ?? "—",
      s.status,
    ];
    if (i % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFF" } };
      });
    }
  });

  [14, 12, 12, 18, 16, 10, 12, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="schedule.xlsx"`,
    },
  });
}
