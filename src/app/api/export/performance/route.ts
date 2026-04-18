import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHostMonthlyStats } from "@/lib/commission";
import ExcelJS from "exceljs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return new Response("Forbidden", { status: 403 });

  const { searchParams } = new URL(req.url);
  const month = Number(searchParams.get("month")) || new Date().getMonth() + 1;
  const year = Number(searchParams.get("year")) || new Date().getFullYear();

  const hosts = await prisma.liveHost.findMany({ where: { isActive: true } });
  const allStats = (await Promise.all(hosts.map((h) => getHostMonthlyStats(h.id, month, year)))).filter(Boolean);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Performance");

  // Style helpers
  const headerFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3730A3" } };
  const subHeaderFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };

  // Title
  ws.mergeCells("A1:L1");
  ws.getCell("A1").value = `Performance Report — ${new Date(year, month - 1).toLocaleString("default", { month: "long" })} ${year}`;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1E1B4B" } };
  ws.getCell("A1").alignment = { horizontal: "center" };
  ws.getRow(1).height = 28;

  // Headers
  const headers = ["Host", "Brand", "Platform", "Sessions Done", "Hours Actual", "Hours Required", "GMV (RM)", "GMV/hr Normal", "KPI Tier", "Late Sessions", "Est. Commission", "Net Commission"];
  ws.getRow(3).values = headers;
  ws.getRow(3).eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FF6366F1" } } };
  });
  ws.getRow(3).height = 22;

  let row = 4;
  for (const s of allStats) {
    if (!s) continue;
    if (s.byBrand.length === 0) {
      ws.getRow(row).values = [s.hostName, "—", "—", s.totalCompletedSessions, s.totalActualHours.toFixed(1), s.requiredHours.toFixed(1), s.totalGMV.toFixed(2), "—", "—", s.lateSessions, s.estimatedCommission.toFixed(2), s.netCommission.toFixed(2)];
      row++;
    } else {
      for (const b of s.byBrand) {
        ws.getRow(row).values = [s.hostName, b.brandName, b.platform, b.completedSessions, b.totalHours.toFixed(1), (s.requiredHours / (s.byBrand.length || 1)).toFixed(1), b.totalGMV.toFixed(2), b.normalDayGMVPerHour.toFixed(2), b.kpiAchievedTier === 2 ? "Tier 2" : b.kpiAchievedTier === 1 ? "Tier 1" : "Below", s.lateSessions, b.estimatedCommission.toFixed(2), s.netCommission.toFixed(2)];
        // Color deductions
        if (s.hoursDeficit > 5 || s.lateSessions > 5) {
          ws.getCell(row, 12).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
          ws.getCell(row, 12).font = { color: { argb: "FFB91C1C" } };
        }
        row++;
      }
    }
  }

  // Column widths
  [18, 16, 10, 14, 14, 14, 16, 16, 12, 14, 16, 16].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="performance-${year}-${String(month).padStart(2, "0")}.xlsx"`,
    },
  });
}
