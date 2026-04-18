import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseMYR, extractHostName, getPunctuality } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role: string }).role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const platform = formData.get("platform") as string;
  const file = formData.get("file") as File;
  if (!file || !platform) return Response.json({ error: "Missing file or platform" }, { status: 400 });

  const text = await file.text();
  const rows: { title: string; startTime: Date; durationSeconds: number; gmv: number }[] = [];

  if (platform === "SHOPEE") {
    const lines = text.split("\n").slice(1).filter((l) => l.trim());
    for (const line of lines) {
      const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
      if (cols.length < 17) continue;
      const title = cols[3];
      const startRaw = cols[4]; // "26-03-2026 21:57"
      const durationRaw = cols[5]; // "02:00:59"
      const gmvRaw = cols[16]; // Sales(Confirmed Order)
      const [datePart, timePart] = startRaw.split(" ");
      const [day, month, year] = datePart.split("-");
      const startTime = new Date(`${year}-${month}-${day}T${timePart}:00`);
      const [h, m, s] = durationRaw.split(":").map(Number);
      const durationSeconds = h * 3600 + m * 60 + (s || 0);
      const gmv = parseMYR(gmvRaw);
      if (!isNaN(startTime.getTime())) {
        rows.push({ title, startTime, durationSeconds, gmv });
      }
    }
  } else if (platform === "TIKTOK") {
    // Excel-like TSV/CSV — but since it's xlsx, we handle it as parsed JSON from client
    // The client sends pre-parsed rows as JSON in a separate field
    const jsonData = formData.get("parsedRows") as string;
    if (jsonData) {
      const parsed = JSON.parse(jsonData);
      for (const row of parsed) {
        const startTime = new Date(row.startTime);
        const durationSeconds = Number(row.duration) || 0;
        const gmv = parseMYR(String(row.directGmv || "0"));
        const title = row.title || "";
        if (!isNaN(startTime.getTime())) {
          rows.push({ title, startTime, durationSeconds, gmv });
        }
      }
    }
  }

  if (rows.length === 0) return Response.json({ error: "No valid rows parsed" }, { status: 400 });

  // Create upload batch
  const batch = await prisma.uploadBatch.create({
    data: { platform, fileName: file.name, period: "", rowCount: rows.length },
  });

  // Get all active hosts for name matching
  const allHosts = await prisma.liveHost.findMany({ where: { isActive: true } });

  // Create imported sessions and try to match
  let matched = 0;
  for (const row of rows) {
    const hostName = extractHostName(row.title);
    const host = hostName
      ? allHosts.find((h) => h.displayName.toUpperCase() === hostName.toUpperCase())
      : null;

    const imported = await prisma.importedSession.create({
      data: {
        platform,
        rawTitle: row.title,
        hostName: hostName,
        startTime: row.startTime,
        durationSeconds: row.durationSeconds,
        gmv: row.gmv,
        uploadBatchId: batch.id,
      },
    });

    // Try to match to a scheduled session
    if (host) {
      const actualEnd = new Date(row.startTime.getTime() + row.durationSeconds * 1000);
      // Find scheduled session within ±2h of actual start time for same host
      const window = 2 * 60 * 60 * 1000;
      const matchedSession = await prisma.session.findFirst({
        where: {
          liveHostId: host.id,
          importedSessionId: null,
          scheduledStart: {
            gte: new Date(row.startTime.getTime() - window),
            lte: new Date(row.startTime.getTime() + window),
          },
        },
        orderBy: { scheduledStart: "asc" },
      });

      if (matchedSession) {
        const rule = await prisma.commissionRule.findFirst({ where: { isDefault: true } });
        const earlyMinutes = rule?.earlyThresholdMinutes ?? 5;
        const punctuality = getPunctuality(
          new Date(matchedSession.scheduledStart),
          row.startTime,
          earlyMinutes
        );
        await prisma.session.update({
          where: { id: matchedSession.id },
          data: {
            actualStart: row.startTime,
            actualEnd: actualEnd,
            actualDurationMinutes: Math.round(row.durationSeconds / 60),
            gmv: row.gmv,
            status: "COMPLETED",
            punctuality,
            importedSessionId: imported.id,
          },
        });
        matched++;
      }
    }
  }

  // Update batch period from first row date
  if (rows.length > 0) {
    const d = rows[0].startTime;
    await prisma.uploadBatch.update({
      where: { id: batch.id },
      data: { period: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` },
    });
  }

  return Response.json({ ok: true, total: rows.length, matched, batchId: batch.id });
}

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const batches = await prisma.uploadBatch.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  return Response.json(batches);
}
