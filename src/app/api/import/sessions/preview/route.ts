import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import ExcelJS from "exceljs";

function toMYTDisplay(dt: Date): string {
  const myt = new Date(dt.getTime() + 8 * 3_600_000);
  const d = myt.toISOString().slice(0, 10);
  const t = myt.toISOString().slice(11, 16);
  return `${d} ${t} MYT`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  const wb = new ExcelJS.Workbook();
  // @ts-expect-error ExcelJS Buffer type incompatibility with @types/node >=20
  await wb.xlsx.load(Buffer.from(await file.arrayBuffer()));

  const ws = wb.getWorksheet("Sessions");
  if (!ws) return Response.json({ error: "Worksheet 'Sessions' not found." }, { status: 400 });

  const rows = ws.getRows(4, ws.rowCount - 3) ?? [];
  const preview: {
    row: number;
    sessionId: string;
    date: string;
    startMyt: string;
    endMyt: string;
    hostId: string;
    brandId: string;
    action: "update" | "create" | "skip";
    error?: string;
  }[] = [];

  for (const row of rows) {
    const rowNum = row.number;
    const sessionId = String(row.getCell(1).value ?? "").trim();
    const dateStr   = String(row.getCell(2).value ?? "").trim();
    const startStr  = String(row.getCell(3).value ?? "").trim();
    const endStr    = String(row.getCell(4).value ?? "").trim();
    const hostId    = String(row.getCell(6).value ?? "").trim();
    const brandId   = String(row.getCell(8).value ?? "").trim();

    if (!dateStr && !sessionId) continue;

    if (!dateStr || !startStr || !endStr) {
      preview.push({ row: rowNum, sessionId, date: dateStr, startMyt: "—", endMyt: "—", hostId, brandId, action: "skip", error: "Missing date or time" });
      continue;
    }

    if (!hostId || !brandId) {
      preview.push({ row: rowNum, sessionId, date: dateStr, startMyt: "—", endMyt: "—", hostId, brandId, action: "skip", error: "Missing Host ID or Brand ID" });
      continue;
    }

    const scheduledStart = new Date(`${dateStr}T${startStr}:00+08:00`);
    let   scheduledEnd   = new Date(`${dateStr}T${endStr}:00+08:00`);
    if (scheduledEnd <= scheduledStart) scheduledEnd = new Date(scheduledEnd.getTime() + 24 * 3_600_000);

    if (isNaN(scheduledStart.getTime())) {
      preview.push({ row: rowNum, sessionId, date: dateStr, startMyt: "—", endMyt: "—", hostId, brandId, action: "skip", error: "Invalid date/time" });
      continue;
    }

    preview.push({
      row: rowNum,
      sessionId: sessionId || "(new)",
      date: dateStr,
      startMyt: toMYTDisplay(scheduledStart),
      endMyt:   toMYTDisplay(scheduledEnd),
      hostId,
      brandId,
      action: sessionId ? "update" : "create",
    });
  }

  return Response.json({ ok: true, rows: preview, total: preview.length });
}
