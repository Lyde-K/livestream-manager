"use client";
import { useState, useEffect, useRef } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, AlertTriangle, Download, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { MonthDatePicker } from "@/components/schedule/schedule-views";

interface Brand { id: string; name: string; color: string; platform: string; }

interface PreviewRow {
  key: string;
  roomTitle: string;
  startMYT: string;
  endMYT: string;
  hostId: string | null;
  hostName: string | null;
  isCampaign: boolean;
  campaignName: string | null;
  gmv: number;
  duration: number | null;
  likelyTest: boolean;
  matchedSlotId: string | null;
  matchedSlotTime: string | null;
}

interface Host { id: string; displayName: string; }

type Platform = "TIKTOK" | "SHOPEE";

// ── Parse TikTok export xlsx client-side ─────────────────────────────────────

// Maps TikTok's actual column header text (lowercase) → our internal field name.
// Verified against real TikTok Creator Live Performance export (MY region, June 2026).
const TIKTOK_COL_MAP: Record<string, string> = {
  // ID / title
  "room id":                          "roomId",
  "live streaming id":                "roomId",
  "room title":                       "roomTitle",
  "live streaming title":             "roomTitle",
  "live room name":                   "roomTitle",
  // Times
  "start time":                       "startTime",
  "end time":                         "endTime",
  "duration":                         "duration",
  "live streaming duration":          "duration",
  // GMV — TikTok MY uses "Attributed GMV"; other regions may say "GMV", "Revenue", etc.
  "attributed gmv":                   "gmv",
  "gmv":                              "gmv",
  "product revenue":                  "gmv",
  "revenue":                          "gmv",
  "sales":                            "gmv",
  // Orders / items
  "attributed items sold":            "itemsSold",
  "items sold":                       "itemsSold",
  "attributed orders":                "orders",
  "orders":                           "orders",
  "product orders":                   "orders",
  "attributed sku orders":            "skuOrders",
  "sku orders":                       "skuOrders",
  // Customers / AOV
  "customers":                        "customers",
  "unique customers":                 "customers",
  "aov":                              "aov",
  "average order value":              "aov",
  // Viewers / views
  "views":                            "views",
  "total views":                      "views",
  // Impressions
  "impressions":                      "impressions",
  "impressions per hour":             "impressionsPerHour",
  // GPM / revenue metrics
  "gmv per hour":                     "gmvPerHour",
  "show gpm":                         "showGpm",
  "watch gpm":                        "watchGpm",
  // View duration
  "avg. viewing duration per view":   "avgViewDurationPerView",
  "avg viewing duration per view":    "avgViewDurationPerView",
  "avg. viewing time per view":       "avgViewDurationPerView",
  "avg. viewing duration":            "avgViewDuration",
  "avg. viewing time":                "avgViewDuration",
  "average viewing time":             "avgViewDuration",
  // CTR / CTOR
  "tap through rate":                 "tapThroughRate",
  "tap-through rate":                 "tapThroughRate",
  "live ctr":                         "liveCtr",
  "product impressions":              "productImpressions",
  "product clicks":                   "productClicks",
  "ctr":                              "ctr",
  "ctr (product impressions)":        "ctr",
  "ctor":                             "ctor",
  "ctor (sku orders)":                "ctorSku",
  "sku order rate":                   "skuOrderRate",
  // Followers / engagement
  "new followers":                    "newFollowers",
  "follow rate":                      "followRate",
  "comments":                         "comments",
  "comment rate":                     "commentRate",
  "comments rate":                    "commentRate",
  "shares":                           "shares",
  "share rate":                       "shareRate",
  "shares rate":                      "shareRate",
  "likes":                            "likes",
  "like rate":                        "likeRate",
  "likes rate":                       "likeRate",
};

async function parseTikTokFile(file: File) {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("No sheet found");

  // Scan rows to find the header row (first row where col A looks like an ID/Room)
  // TikTok format: Row 1 = date range, Row 2 = empty, Row 3 = column headers, Row 4+ = data
  // But find it dynamically in case the format shifts
  let headerRowNum = -1;
  let colIndexMap: Record<string, number> = {};

  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (headerRowNum !== -1) return;
    const vals = (row.values as unknown[]).slice(1);
    const firstCell = String(vals[0] ?? "").trim().toLowerCase();
    // Header row starts with a known ID/title column name
    if (TIKTOK_COL_MAP[firstCell] !== undefined || firstCell.includes("id") || firstCell.includes("title") || firstCell.includes("room")) {
      headerRowNum = n;
      vals.forEach((v, i) => {
        const key = String(v ?? "").trim().toLowerCase();
        const mapped = TIKTOK_COL_MAP[key];
        if (mapped) colIndexMap[mapped] = i;
      });
      console.log("[TikTok import] detected headers:", vals.map(v => String(v ?? "").trim()), "→ mapped:", colIndexMap);
    }
  });

  // Fallback: if header detection failed, use fixed positional mapping
  if (headerRowNum === -1) {
    console.warn("[TikTok import] header row not found, falling back to positional mapping");
    const FALLBACK = ["roomId","roomTitle","startTime","endTime","duration","gmv",
      "itemsSold","orders","skuOrders","customers","aov","views",
      "impressions","impressionsPerHour","gmvPerHour","showGpm","watchGpm",
      "avgViewDurationPerView","avgViewDuration","tapThroughRate","liveCtr",
      "productImpressions","productClicks","ctr","ctor","ctorSku","skuOrderRate",
      "newFollowers","followRate","comments","commentRate","shares","shareRate","likes","likeRate"];
    FALLBACK.forEach((h, i) => { colIndexMap[h] = i; });
    headerRowNum = 3;
  }

  const rows: Record<string, string>[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n <= headerRowNum) return;
    const vals = (row.values as unknown[]).slice(1);
    if (!vals[colIndexMap["roomId"] ?? 0]) return;
    const obj: Record<string, string> = {};
    for (const [field, idx] of Object.entries(colIndexMap)) {
      obj[field] = String(vals[idx] ?? "").trim();
    }
    rows.push(obj);
  });

  return rows;
}

// ── Parse 13Media internal Shopee xlsx format ────────────────────────────────
// Columns: BRAND(0) Host(1) Hours(2) Campaign(3) Date(4) Month(5)
//          Punctuality(6) Slot(7) Livestream Name(8) Start Time(9) Duration(10)
//          Engaged Viewers(11) Comments(12) ATC(13) Avg View Duration(14)
//          Viewers(15) Orders Placed(16) Orders Confirmed(17) Conv%(18)
//          Items Sold Placed(19) Items Sold Confirmed(20) Sales Placed(21) Sales Confirmed(22)
// Start Time is stored as UTC datetime; Slot is MYT local time.
// Returns parsed rows + autoOverrides (host display name → host ID mappings).

function excelTimeToHMS(val: unknown): string {
  if (val instanceof Date) {
    // ExcelJS returns duration cells as Date objects anchored at the Excel epoch (1899-12-30)
    const epochMs = Date.UTC(1899, 11, 30);
    const totalSecs = Math.round((val.getTime() - epochMs) / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }
  if (typeof val === "number") {
    const totalSecs = Math.round(val * 86400);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }
  return String(val ?? "");
}

async function parseShopeeXlsxFile(file: File, hosts: Host[]) {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("No sheet found in xlsx");

  type ShopeeRowData = { no: string; title: string; startTime: string; duration: string; engagedViewers: string; comments: string; atc: string; avgViewDuration: string; viewers: string; ordersPlaced: string; ordersConfirmed: string; itemsSoldPlaced: string; itemsSoldConfirmed: string; salesPlaced: string; salesConfirmed: string };
  const rows: ShopeeRowData[] = [];
  const autoOverrides: Record<string, string> = {};
  let rowIdx = 0;

  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return; // skip header row
    const vals = (row.values as unknown[]).slice(1); // convert 1-based to 0-based
    const title = String(vals[8] ?? "").trim();
    const startTimeRaw = vals[9];
    if (!title || !startTimeRaw) return;

    rowIdx++;

    // Start Time is UTC datetime → convert to MYT "DD-MM-YYYY HH:MM"
    let startTimeMYT = "";
    if (startTimeRaw instanceof Date) {
      const myt = new Date(startTimeRaw.getTime() + 8 * 3600 * 1000);
      const dd   = String(myt.getUTCDate()).padStart(2, "0");
      const mm   = String(myt.getUTCMonth() + 1).padStart(2, "0");
      const yyyy = myt.getUTCFullYear();
      const hh   = String(myt.getUTCHours()).padStart(2, "0");
      const min  = String(myt.getUTCMinutes()).padStart(2, "0");
      startTimeMYT = `${dd}-${mm}-${yyyy} ${hh}:${min}`;
    } else {
      return;
    }

    const no  = String(rowIdx);
    const key = `SP-${no}-${startTimeMYT.replace(/[^0-9]/g, "")}`;

    // Resolve host name (col 1) → host ID for autoOverrides
    const hostName = String(vals[1] ?? "").trim().toUpperCase();
    if (hostName) {
      const matched = hosts.find(h =>
        h.displayName.toUpperCase() === hostName ||
        h.displayName.toUpperCase().replace(/[()]/g, "").replace(/\s+/g, " ").trim() === hostName
      );
      if (matched) autoOverrides[key] = matched.id;
    }

    rows.push({
      no,
      title,
      startTime:         startTimeMYT,
      duration:          excelTimeToHMS(vals[10]),
      engagedViewers:    String(vals[11] ?? ""),
      comments:          String(vals[12] ?? ""),
      atc:               String(vals[13] ?? ""),
      avgViewDuration:   excelTimeToHMS(vals[14]),
      viewers:           String(vals[15] ?? ""),
      ordersPlaced:      String(vals[16] ?? ""),
      ordersConfirmed:   String(vals[17] ?? ""),
      itemsSoldPlaced:   String(vals[19] ?? ""),
      itemsSoldConfirmed:String(vals[20] ?? ""),
      salesPlaced:       String(vals[21] ?? ""),
      salesConfirmed:    String(vals[22] ?? ""),
    });
  });

  return { rows, autoOverrides };
}

// ── Parse Shopee export CSV client-side ──────────────────────────────────────

async function parseShopeeFile(file: File) {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  // Row 1 = headers, Row 2+ = data
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (!cols[0]) continue;
    rows.push({
      no:                  cols[2]  ?? "",
      title:               cols[3]  ?? "",
      startTime:           cols[4]  ?? "",
      duration:            cols[5]  ?? "",
      engagedViewers:      cols[6]  ?? "",
      comments:            cols[7]  ?? "",
      atc:                 cols[8]  ?? "",
      avgViewDuration:     cols[9]  ?? "",
      viewers:             cols[10] ?? "",
      ordersPlaced:        cols[11] ?? "",
      ordersConfirmed:     cols[12] ?? "",
      itemsSoldPlaced:     cols[13] ?? "",
      itemsSoldConfirmed:  cols[14] ?? "",
      salesPlaced:         cols[15] ?? "",
      salesConfirmed:      cols[16] ?? "",
    });
  }
  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === "," && !inQuote) { result.push(cur); cur = ""; continue; }
    cur += ch;
  }
  result.push(cur);
  return result;
}

async function parseAdsCostFile(file: File) {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("No sheet found");

  const rows: { roomId: string; cost: string; netCost: string; grossRevenue: string; roi: string }[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n < 2) return;
    const vals = (row.values as unknown[]).slice(1);
    if (!vals[0]) return;
    rows.push({
      roomId:       String(vals[0] ?? "").trim(),
      cost:         String(vals[5] ?? "").trim(),
      netCost:      String(vals[6] ?? "").trim(),
      grossRevenue: String(vals[9] ?? "").trim(),
      roi:          String(vals[10] ?? "").trim(),
    });
  });
  return rows;
}

function fmtMYT(iso: string) {
  return new Date(iso).toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function fmtRM(n: number) {
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

type Step = "upload" | "preview" | "done";
type Tab  = "import" | "export";

// ── Export helpers ────────────────────────────────────────────────────────────

interface ExportSession {
  id: string;
  externalRef: string | null;
  platform: string;
  title: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  actualStart: string | null;
  actualDurationMinutes: number | null;
  isCampaignDay: boolean;
  punctuality: string | null;
  gmv: number | null;
  grossRevenue: number | null;
  adsCost: number | null;
  itemsSold: number | null;
  itemsSoldPlaced: number | null;
  ordersPlaced: number | null;
  ordersConfirmed: number | null;
  salesPlaced: number | null;
  views: number | null;
  viewers: number | null;
  engagedViewers: number | null;
  productImpressions: number | null;
  productClicks: number | null;
  addToCart: number | null;
  ctr: number | null;
  ctor: number | null;
  newFollowers: number | null;
  comments: number | null;
  shares: number | null;
  likes: number | null;
  avgViewDurationSec: number | null;
  liveHost: { displayName: string } | null;
  brand: { name: string };
}

// Convert seconds to Excel time fraction (fraction of 24h)
function secsToExcelTime(secs: number): number {
  return secs / 86400;
}

// Convert HH:MM:SS-equivalent minutes to Excel time fraction
function minsToExcelTime(mins: number): number {
  return mins / (24 * 60);
}

// MYT offset helper — returns {h, m} local time in MYT
function mytTimeParts(iso: string): { h: number; m: number; s: number } {
  const d = new Date(iso);
  const myt = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }));
  return { h: myt.getHours(), m: myt.getMinutes(), s: myt.getSeconds() };
}

function mytDateStr(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "2-digit", year: "numeric" })
    .split("/").join("-"); // "24-06-2026"
}

function mytMonthName(iso: string): string {
  return new Date(iso).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", month: "long" });
}

async function downloadExport(sessions: ExportSession[], platform: string, month: string, brandName: string) {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();

  const bothPlatforms = platform === "ALL";

  // ── Shopee sheet — exact format from sample ───────────────────────────────
  function makeShopeeSheet(ws: InstanceType<typeof ExcelJS.Workbook>["worksheets"][0], rows: ExportSession[]) {
    const HEADERS = [
      "BRAND","Host","Hours","Campaign","Date","Month","Punctuality","Slot",
      "Livestream Name","Start Time","Duration","Engaged Viewers","Comments","ATC",
      "Avg. Viewing Duration","Viewers","Orders(Placed Order)","Orders(Confirmed Order)",
      "Conversion Rate (%)","Items Sold(Placed Order)","Items Sold(Confirmed Order)","Sales(Placed Order)","Sales(Confirmed Order)",
    ];
    ws.addRow(HEADERS);
    const hr = ws.getRow(1);
    hr.font = { bold: true };
    hr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };

    for (const s of rows) {
      const startIso  = s.actualStart ?? s.scheduledStart;
      const durationMins = s.actualDurationMinutes ?? 0;
      const slotParts = mytTimeParts(s.scheduledStart);
      const slotFrac  = secsToExcelTime(slotParts.h * 3600 + slotParts.m * 60);
      const durationFrac = minsToExcelTime(durationMins);
      const avgViewFrac  = s.avgViewDurationSec != null ? secsToExcelTime(s.avgViewDurationSec) : null;
      const punctuality  = s.punctuality === "LATE" ? "No" : "Yes";
      const campaign     = s.isCampaignDay ? "Campaign" : "BAU";
      const hours        = +(durationMins / 60).toFixed(6);

      const row = ws.addRow([
        s.brand.name,
        s.liveHost?.displayName ?? "",
        hours,
        campaign,
        mytDateStr(startIso),
        mytMonthName(startIso),
        punctuality,
        slotFrac,
        s.title ?? "",
        new Date(startIso),
        durationFrac,
        s.engagedViewers ?? "",
        s.comments ?? "",
        s.addToCart ?? s.productClicks ?? "",
        avgViewFrac ?? "",
        s.viewers ?? "",
        s.ordersPlaced ?? "",
        s.ordersConfirmed ?? "",
        s.viewers && s.viewers > 0 && s.ordersConfirmed != null
          ? +((s.ordersConfirmed / s.viewers) * 100).toFixed(2)
          : "",
        s.itemsSoldPlaced ?? "",
        s.itemsSold ?? "",
        s.salesPlaced ?? "",
        s.gmv ?? 0,
      ]);

      // Format time/date cells
      row.getCell(8).numFmt  = "h:mm";               // Slot
      row.getCell(10).numFmt = "DD-MM-YYYY hh:mm";   // Start Time
      row.getCell(11).numFmt = "[h]:mm:ss";           // Duration
      row.getCell(15).numFmt = "[h]:mm:ss";           // Avg View Duration
    }

    ws.columns.forEach(col => {
      let max = 10;
      col.eachCell?.({ includeEmpty: false }, cell => {
        const len = String(cell.value ?? "").length;
        if (len > max) max = len;
      });
      col.width = Math.min(max + 2, 40);
    });
  }

  // ── TikTok sheet ──────────────────────────────────────────────────────────
  function makeTikTokSheet(ws: InstanceType<typeof ExcelJS.Workbook>["worksheets"][0], rows: ExportSession[]) {
    const HEADERS = [
      "Brand","Host","Hours","Campaign","Date","Month","Livestream Name",
      "Start Time","End Time","Duration (hrs)",
      "GMV (RM)","Ads Cost (RM)","Gross Revenue (RM)","Net Revenue (RM)","ROI","GMV/hr (RM)",
      "Items Sold","Orders Placed",
      "Views","Product Impressions","Product Clicks","CTR (%)","CTOR (%)","New Followers","Comments","Shares","Likes","Avg View Duration (sec)",
    ];
    ws.addRow(HEADERS);
    const hr = ws.getRow(1);
    hr.font = { bold: true };
    hr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };

    for (const s of rows) {
      const startIso = s.actualStart ?? s.scheduledStart;
      const endIso   = s.scheduledEnd;
      const durationHrs = s.actualDurationMinutes != null ? +(s.actualDurationMinutes / 60).toFixed(4) : "";
      const net  = (s.gmv ?? 0) - (s.adsCost ?? 0);
      const roi  = s.adsCost && s.adsCost > 0 ? +((s.gmv ?? 0) / s.adsCost).toFixed(2) : "";
      const gmvH = s.actualDurationMinutes && s.actualDurationMinutes > 0 ? +((s.gmv ?? 0) / (s.actualDurationMinutes / 60)).toFixed(2) : "";

      ws.addRow([
        s.brand.name,
        s.liveHost?.displayName ?? "",
        durationHrs,
        s.isCampaignDay ? "Campaign" : "BAU",
        mytDateStr(startIso),
        mytMonthName(startIso),
        s.title ?? "",
        new Date(startIso),
        new Date(endIso),
        durationHrs,
        s.gmv ?? 0,
        s.adsCost ?? 0,
        s.grossRevenue ?? "",
        net,
        roi,
        gmvH,
        s.itemsSold ?? "",
        s.ordersPlaced ?? "",
        s.views ?? "",
        s.productImpressions ?? "",
        s.productClicks ?? "",
        s.ctr != null ? +(s.ctr * 100).toFixed(2) : "",
        s.ctor != null ? +(s.ctor * 100).toFixed(2) : "",
        s.newFollowers ?? "",
        s.comments ?? "",
        s.shares ?? "",
        s.likes ?? "",
        s.avgViewDurationSec ?? "",
      ]);
    }

    ws.columns.forEach(col => {
      let max = 10;
      col.eachCell?.({ includeEmpty: false }, cell => {
        const len = String(cell.value ?? "").length;
        if (len > max) max = len;
      });
      col.width = Math.min(max + 2, 40);
    });
  }

  if (bothPlatforms) {
    const tiktokRows = sessions.filter(s => s.platform === "TIKTOK");
    const shopeeRows = sessions.filter(s => s.platform === "SHOPEE");
    if (tiktokRows.length) makeTikTokSheet(wb.addWorksheet("TikTok"), tiktokRows);
    if (shopeeRows.length) makeShopeeSheet(wb.addWorksheet("Shopee"), shopeeRows);
  } else if (platform === "SHOPEE") {
    makeShopeeSheet(wb.addWorksheet("Shopee"), sessions);
  } else {
    makeTikTokSheet(wb.addWorksheet("TikTok"), sessions);
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `livestream-${brandName}-${month}-${platform.toLowerCase()}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LivestreamImportPage() {
  const [tab, setTab]                 = useState<Tab>("import");
  const [brands, setBrands]           = useState<Brand[]>([]);
  const [hosts, setHosts]             = useState<Host[]>([]);
  const [brandId, setBrandId]         = useState("");
  const [month, setMonth]             = useState(thisMonth());
  const [platform, setPlatform]       = useState<Platform>("TIKTOK");

  // Export state
  const [exportBrandId, setExportBrandId]   = useState("");
  const [exportMonth, setExportMonth]       = useState(thisMonth());
  const [exportPlatform, setExportPlatform] = useState<Platform | "ALL">("ALL");
  const [exportLoading, setExportLoading]   = useState(false);
  const [exportError, setExportError]       = useState("");
  const [sessionsFile, setSessionsFile] = useState<File | null>(null);
  const [adsCostFile, setAdsCostFile] = useState<File | null>(null);
  const [step, setStep]               = useState<Step>("upload");
  const [preview, setPreview]         = useState<PreviewRow[]>([]);
  const [hostOverrides, setHostOverrides]         = useState<Record<string, string>>({});
  const [campaignOverrides, setCampaignOverrides] = useState<Record<string, boolean>>({});
  const [excludeTests, setExcludeTests]       = useState(true);
  const [showUnmatchedOnly, setShowUnmatchedOnly] = useState(false);
  const [selectedKeys, setSelectedKeys]       = useState<Set<string>>(new Set());
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [result, setResult]           = useState<{ inserted: number; updated?: number; skipped: number; unmatched: number; unmatchedTitles?: string[]; adsCostMatched?: number } | null>(null);
  const [dbSessions, setDbSessions]   = useState<{ summary: { total: number; totalGMV: number; byType: { adminCreated: number; shopeeImported: number; tiktokImported: number } }; sessions: Array<{ id: string; externalRef: string | null; platform: string; status: string; scheduledStart: string; gmv: number | null; liveHost: { displayName: string } | null; title: string | null }> } | null>(null);
  const [dbLoading, setDbLoading]     = useState(false);

  // Product file state (uploaded alongside session file in Step 1)
  const [productFile, setProductFile]         = useState<File | null>(null);
  const [productResult, setProductResult]     = useState<{ count: number } | null>(null);
  const [productError, setProductError]       = useState("");

  const sessionsRef = useRef<HTMLInputElement>(null);
  const adsCostRef  = useRef<HTMLInputElement>(null);
  const productRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/brands?hasLivestream=1").then(r => r.json()).then((b: Brand[]) => setBrands(b.filter(x => x)));
    fetch("/api/hosts").then(r => r.json()).then((d: (Host & { displayName: string })[]) => {
      setHosts(d.map(h => ({ id: h.id, displayName: h.displayName })));
    });
  }, []);

  useEffect(() => {
    if (!brandId || !month) { setDbSessions(null); return; }
    setDbLoading(true);
    fetch(`/api/admin/sessions/debug?brandId=${brandId}&month=${month}&platform=${platform}`)
      .then(r => r.json())
      .then(d => setDbSessions(d))
      .catch(() => setDbSessions(null))
      .finally(() => setDbLoading(false));
  }, [brandId, month, platform]);

  // Reset file when platform changes
  function handlePlatformChange(p: Platform) {
    setPlatform(p);
    setBrandId("");
    setSessionsFile(null);
    setAdsCostFile(null);
    setProductFile(null);
    if (sessionsRef.current) sessionsRef.current.value = "";
    if (adsCostRef.current) adsCostRef.current.value = "";
    if (productRef.current) productRef.current.value = "";
  }

  const isShopeeXlsx = platform === "SHOPEE" && (sessionsFile?.name.toLowerCase().endsWith(".xlsx") ?? false);

  async function handlePreview() {
    if (!brandId || !month || !sessionsFile) { setError("Select brand, month, and session file"); return; }
    setError(""); setLoading(true);
    try {
      let rows: unknown[];
      let mergedOverrides = { ...hostOverrides };
      if (platform === "TIKTOK") {
        rows = await parseTikTokFile(sessionsFile);
      } else if (isShopeeXlsx) {
        const parsed = await parseShopeeXlsxFile(sessionsFile, hosts);
        rows = parsed.rows;
        mergedOverrides = { ...parsed.autoOverrides, ...hostOverrides }; // user overrides win
      } else {
        rows = await parseShopeeFile(sessionsFile);
      }

      const res = await fetch("/api/import/livestream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", platform, brandId, month, rows, hostOverrides: mergedOverrides, campaignOverrides }),
      });
      const rawText = await res.text();
      let data: Record<string, unknown>;
      try { data = JSON.parse(rawText); } catch {
        throw new Error(`Server error ${res.status}: ${rawText.slice(0, 200) || "(empty response)"}`);
      }
      if (!res.ok) { setError((data.error as string) ?? "Preview failed"); return; }
      setPreview(data.preview as PreviewRow[]);
      setHostOverrides(isShopeeXlsx ? mergedOverrides : {});
      setCampaignOverrides({});
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally { setLoading(false); }
  }

  async function importProductFile(file: File, plt: Platform, bId: string, mo: string): Promise<number> {
    const isCSV = file.name.toLowerCase().endsWith(".csv");

    // ── Parse into a uniform 2-D array of strings ──────────────────────────────
    let grid: string[][] = [];

    if (isCSV) {
      const text = await file.text();
      // Simple CSV parser — handles quoted fields with embedded commas/newlines
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim()) continue;
        const cells: string[] = [];
        let cur = "", inQ = false;
        for (let ci = 0; ci < line.length; ci++) {
          const ch = line[ci];
          if (ch === '"') { inQ = !inQ; }
          else if (ch === "," && !inQ) { cells.push(cur.trim()); cur = ""; }
          else { cur += ch; }
        }
        cells.push(cur.trim());
        grid.push(cells);
      }
    } else {
      const buf = await file.arrayBuffer();
      const ExcelJS = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const ws = wb.worksheets[0];
      if (!ws) throw new Error("No sheet found in product file");
      ws.eachRow((row) => {
        const vals = (row.values as (string | number | null | undefined)[]).slice(1);
        grid.push(vals.map(v => String(v ?? "").trim()));
      });
    }

    if (grid.length === 0) throw new Error("Product file is empty");

    // ── Find header row ─────────────────────────────────────────────────────────
    let headerRowIdx = -1;
    const colMap: Record<string, number> = {};
    for (let ri = 0; ri < grid.length; ri++) {
      const hasHeader = grid[ri].some(v => /product|item|sku|gmv|sale|unit|sold|order|click|revenue/i.test(v));
      if (hasHeader) {
        headerRowIdx = ri;
        grid[ri].forEach((v, i) => { if (v) colMap[v.toLowerCase()] = i; });
        break;
      }
    }
    if (headerRowIdx === -1) throw new Error("Could not find header row in product file");

    function findCol(...keys: string[]): number {
      for (const k of keys) {
        for (const [h, i] of Object.entries(colMap)) {
          if (h.includes(k)) return i;
        }
      }
      return -1;
    }

    let nameIdx: number, gmvIdx: number, unitsIdx: number, ordIdx: number, clkIdx: number, atcIdx: number;
    if (plt === "SHOPEE") {
      nameIdx  = findCol("product(s)", "product");
      gmvIdx   = findCol("sales(confirmed order)", "sales");
      unitsIdx = findCol("items sold(confirmed order)", "items sold");
      ordIdx   = findCol("orders(confirmed order)", "orders");
      clkIdx   = findCol("product clicks", "clicks", "click");
      atcIdx   = findCol("atc");
    } else {
      nameIdx  = findCol("product info", "product name", "product");
      gmvIdx   = findCol("gross revenue", "revenue", "gmv", "sales");
      unitsIdx = findCol("unit sales", "units sold", "unit");
      ordIdx   = findCol("order", "orders");
      clkIdx   = findCol("click", "clicks");
      atcIdx   = -1;
    }

    if (nameIdx === -1) throw new Error("Could not find product name column");
    if (gmvIdx  === -1) throw new Error("Could not find GMV/sales column");

    const rows: { productName: string; gmv: number; unitsSold: number; orders: number; clicks: number; convRate?: number }[] = [];

    function numStr(s: string): number {
      return parseFloat(s.replace(/[^0-9.-]/g, "")) || 0;
    }

    for (let ri = headerRowIdx + 1; ri < grid.length; ri++) {
      const cells = grid[ri];
      const name = cells[nameIdx]?.trim() ?? "";
      if (!name) continue;
      const atc = atcIdx !== -1 ? numStr(cells[atcIdx] ?? "") : undefined;
      rows.push({
        productName: name,
        gmv:       numStr(cells[gmvIdx]  ?? ""),
        unitsSold: Math.round(numStr(cells[unitsIdx] ?? "")),
        orders:    Math.round(numStr(cells[ordIdx]   ?? "")),
        clicks:    Math.round(numStr(cells[clkIdx]   ?? "")),
        convRate:  atc != null && atc > 0 ? atc : undefined,
      });
    }

    if (rows.length === 0) throw new Error("No data rows found in product file");

    const [moYear, moMonth] = mo.split("-").map(Number);
    const res = await fetch("/api/product-performance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: bId, platform: plt, month: moMonth, year: moYear, replace: true, rows }),
    });
    if (!res.ok) throw new Error("Product upload failed");
    const json = await res.json();
    return json.count as number;
  }

  async function handleConfirm() {
    setError(""); setLoading(true);
    try {
      let rows: unknown[];
      let mergedOverrides = { ...hostOverrides };
      if (platform === "TIKTOK") {
        rows = await parseTikTokFile(sessionsFile!);
      } else if (isShopeeXlsx) {
        const parsed = await parseShopeeXlsxFile(sessionsFile!, hosts);
        rows = parsed.rows;
        mergedOverrides = { ...parsed.autoOverrides, ...hostOverrides };
      } else {
        rows = await parseShopeeFile(sessionsFile!);
      }

      const res = await fetch("/api/import/livestream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", platform, brandId, month, rows, hostOverrides: mergedOverrides, campaignOverrides }),
      });
      const rawText2 = await res.text();
      let data: Record<string, unknown>;
      try { data = JSON.parse(rawText2); } catch {
        throw new Error(`Server error ${res.status}: ${rawText2.slice(0, 200) || "(empty response)"}`);
      }
      if (!res.ok) { setError((data.error as string) ?? "Import failed"); return; }

      let adsCostMatched = 0;
      // Ads cost only applicable for TikTok
      if (platform === "TIKTOK" && adsCostFile) {
        const adsCostRows = await parseAdsCostFile(adsCostFile);
        const patchRes = await fetch("/api/import/livestream", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: adsCostRows }),
        });
        const patchData = await patchRes.json();
        adsCostMatched = patchData.matched ?? 0;
      }

      setResult({ ...(data as { inserted: number; updated?: number; skipped: number; unmatched: number }), adsCostMatched: platform === "TIKTOK" ? adsCostMatched : undefined });

      // Product import — runs after session import succeeds
      if (productFile && brandId) {
        setProductResult(null); setProductError("");
        try {
          const pCount = await importProductFile(productFile, platform, brandId, month);
          setProductResult({ count: pCount });
        } catch (pe) {
          setProductError(pe instanceof Error ? pe.message : "Product import failed");
        }
      }

      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally { setLoading(false); }
  }

  async function handleExport() {
    if (!exportBrandId || !exportMonth) { setExportError("Select brand and month"); return; }
    setExportError(""); setExportLoading(true);
    try {
      const params = new URLSearchParams({ brandId: exportBrandId, month: exportMonth });
      if (exportPlatform !== "ALL") params.set("platform", exportPlatform);
      const res = await fetch(`/api/export/livestream?${params}`);
      const data = await res.json();
      if (!res.ok) { setExportError(data.error ?? "Export failed"); return; }
      if (!data.sessions?.length) { setExportError("No completed sessions found for this selection"); return; }
      const brand = brands.find(b => b.id === exportBrandId);
      await downloadExport(data.sessions, exportPlatform, exportMonth, brand?.name ?? exportBrandId);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Unexpected error");
    } finally { setExportLoading(false); }
  }

  function reset() {
    setStep("upload"); setPreview([]); setHostOverrides({}); setCampaignOverrides({}); setSelectedKeys(new Set());
    setSessionsFile(null); setAdsCostFile(null); setResult(null); setError("");
    setProductFile(null); setProductResult(null); setProductError("");
    if (sessionsRef.current) sessionsRef.current.value = "";
    if (adsCostRef.current) adsCostRef.current.value = "";
    if (productRef.current) productRef.current.value = "";
  }

  const brandsForPlatform = (p: string) =>
    brands.filter(b => b.platform === p || b.platform === "BOTH");

  const basePreview    = excludeTests ? preview.filter(p => !p.likelyTest) : preview;
  const unmatchedRows  = basePreview.filter(p => !(hostOverrides[p.key] ?? p.hostId ?? ""));
  const visiblePreview = showUnmatchedOnly ? unmatchedRows : basePreview;
  const testCount      = preview.filter(p => p.likelyTest).length;

  const allVisibleKeys = visiblePreview.map(p => p.key);
  const allSelected    = allVisibleKeys.length > 0 && allVisibleKeys.every(k => selectedKeys.has(k));
  const someSelected   = allVisibleKeys.some(k => selectedKeys.has(k));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedKeys(prev => { const n = new Set(prev); allVisibleKeys.forEach(k => n.delete(k)); return n; });
    } else {
      setSelectedKeys(prev => new Set([...prev, ...allVisibleKeys]));
    }
  }

  function toggleSelectRow(key: string) {
    setSelectedKeys(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  function removeSelected() {
    setPreview(prev => prev.filter(p => !selectedKeys.has(p.key)));
    setSelectedKeys(new Set());
  }

  return (
    <div className="space-y-6 animate-in max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(249,115,22,.12)" }}>
          <Upload size={16} style={{ color: "#f97316" }} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Livestream Import</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Upload session export · hosts matched from title · campaign days auto-detected
          </p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
        {(["import", "export"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-md text-sm font-semibold capitalize transition-all"
            style={tab === t
              ? { background: "var(--bg-card)", color: "var(--text-primary)", boxShadow: "0 1px 3px rgba(0,0,0,.15)" }
              : { color: "var(--text-muted)" }}>
            {t === "import" ? "Import" : "Export"}
          </button>
        ))}
      </div>

      {/* ── EXPORT TAB ── */}
      {tab === "export" && (
        <div className="section-card p-5 space-y-5 max-w-2xl">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Download session data as Excel — includes adjusted columns (ads cost, net revenue, ROI, GMV/hr) plus all raw metrics.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Brand</label>
              <Select value={exportBrandId} onChange={e => setExportBrandId(e.target.value)}>
                <option value="">Select brand…</option>
                {(exportPlatform === "ALL" ? brands : brandsForPlatform(exportPlatform)).map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Month</label>
              <MonthDatePicker
                gridDate={`${exportMonth}-01`}
                setGridDate={d => setExportMonth(d.slice(0, 7))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Platform</label>
              <Select value={exportPlatform} onChange={e => { setExportPlatform(e.target.value as Platform | "ALL"); setExportBrandId(""); }}>
                <option value="ALL">All platforms</option>
                <option value="TIKTOK">TikTok</option>
                <option value="SHOPEE">Shopee</option>
              </Select>
            </div>
          </div>

          <div className="text-xs space-y-1 rounded-lg px-3 py-2.5" style={{ background: "var(--bg-subtle)", color: "var(--text-muted)" }}>
            <p className="font-semibold" style={{ color: "var(--text-secondary)" }}>Shopee columns:</p>
            <p>Brand · Host · Hours · Campaign/BAU · Date · Month · Punctuality · Slot · Livestream Name · Start Time · Duration · Engaged Viewers · Comments · ATC · Avg. View Duration · Viewers · Orders(Placed/Confirmed) · Items Sold(Placed/Confirmed) · Sales(Placed/Confirmed)</p>
            <p className="font-semibold mt-1" style={{ color: "var(--text-secondary)" }}>TikTok columns:</p>
            <p>Brand · Host · Hours · Campaign/BAU · Date · Month · Livestream Name · Start/End · GMV · Ads Cost · Net Revenue · ROI · GMV/hr · Items Sold · Orders · Views · CTR · CTOR · Followers · Comments · Shares · Likes · Avg View Duration</p>
            <p className="italic mt-1">All platforms in one file — TikTok and Shopee on separate sheets when "All platforms" is selected.</p>
          </div>

          {exportError && <ErrorBanner message={exportError} />}

          <div className="flex justify-end">
            <Button onClick={handleExport} loading={exportLoading} disabled={!exportBrandId}>
              <Download size={14} /> Download Excel
            </Button>
          </div>
        </div>
      )}

      {tab === "import" && <>
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs font-semibold">
        {(["upload","preview","done"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full"
              style={step === s
                ? { background: "var(--accent)", color: "#fff" }
                : { background: "var(--bg-subtle)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
              {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
            {i < 2 && <ChevronRight size={12} style={{ color: "var(--text-muted)" }} />}
          </div>
        ))}
      </div>

      {/* ── STEP 1: Upload ── */}
      {step === "upload" && (
        <div className="section-card p-5 space-y-5 max-w-2xl">
          {/* Platform toggle */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Platform</label>
            <div className="flex gap-2">
              {(["TIKTOK", "SHOPEE"] as Platform[]).map(p => (
                <button
                  key={p}
                  onClick={() => handlePlatformChange(p)}
                  className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
                  style={platform === p
                    ? { background: "var(--accent)", color: "#fff" }
                    : { background: "var(--bg-subtle)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                >
                  {p === "TIKTOK" ? "TikTok" : "Shopee"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Brand</label>
              <Select value={brandId} onChange={e => setBrandId(e.target.value)}>
                <option value="">Select brand…</option>
                {brandsForPlatform(platform).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Month</label>
              <MonthDatePicker
                gridDate={`${month}-01`}
                setGridDate={d => setMonth(d.slice(0, 7))}
              />
            </div>
          </div>

          {/* Existing DB sessions for this brand+month */}
          {brandId && month && (
            <div className="rounded-lg border p-3 space-y-1.5 text-xs" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
              <div className="flex items-center justify-between">
                <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Existing sessions in DB for {month}
                </span>
                {dbLoading && <span style={{ color: "var(--text-muted)" }}>Loading…</span>}
              </div>
              {dbSessions && !dbLoading && (
                <>
                  <div className="flex gap-4 flex-wrap">
                    <span>Total: <b>{dbSessions.summary.total}</b></span>
                    <span>GMV: <b>RM {(dbSessions.summary.totalGMV ?? 0).toLocaleString("en-MY", { maximumFractionDigits: 2 })}</b></span>
                    <span style={{ color: dbSessions.summary.byType.adminCreated > 0 ? "#f59e0b" : "var(--text-muted)" }}>
                      Admin-created: <b>{dbSessions.summary.byType.adminCreated}</b>
                    </span>
                    <span>
                      {platform === "SHOPEE" ? "SP- imported" : "TT- imported"}: <b>{platform === "SHOPEE" ? dbSessions.summary.byType.shopeeImported : dbSessions.summary.byType.tiktokImported}</b>
                    </span>
                  </div>
                  {dbSessions.sessions.length > 0 && (
                    <div className="mt-1 max-h-36 overflow-y-auto space-y-0.5">
                      {dbSessions.sessions.map(s => {
                        const isAdmin = !s.externalRef || (!s.externalRef.startsWith("TT-") && !s.externalRef.startsWith("SP-"));
                        const date = new Date(s.scheduledStart).toLocaleDateString("en-MY", { day: "2-digit", month: "short", timeZone: "Asia/Kuala_Lumpur" });
                        return (
                          <div key={s.id} className="flex gap-2 items-center" style={{ color: isAdmin ? "#f59e0b" : "var(--text-muted)" }}>
                            <span className="w-14 shrink-0">{date}</span>
                            <span className="w-16 shrink-0 font-mono text-[10px]">{isAdmin ? "admin" : (s.externalRef?.slice(0, 12) ?? "—")}</span>
                            <span className="truncate flex-1">{s.liveHost?.displayName ?? "—"}: {s.title ?? "—"}</span>
                            <span className="shrink-0 font-semibold" style={{ color: (s.gmv ?? 0) > 0 ? "var(--text-primary)" : "var(--text-muted)" }}>
                              RM {(s.gmv ?? 0).toLocaleString("en-MY", { maximumFractionDigits: 0 })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {dbSessions.summary.byType.adminCreated > 0 && (
                    <p style={{ color: "#f59e0b" }}>
                      ⚠ Admin-created sessions won&apos;t be deleted during import — they&apos;ll only be updated if a CSV row matches the host &amp; time (±2h).
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <FileSlot
            label={platform === "TIKTOK" ? "TikTok Session Export (.xlsx)" : "Shopee Livestream Export (.csv)"}
            hint={platform === "TIKTOK"
              ? "Creator Live Performance export — all sessions for this brand's account"
              : "Shopee Seller Centre → Livestream → Export CSV"}
            file={sessionsFile}
            onPick={setSessionsFile}
            inputRef={sessionsRef}
            accept={platform === "TIKTOK" ? ".xlsx" : ".csv,.xlsx"}
            required
          />

          {platform === "TIKTOK" && (
            <FileSlot
              label="Ads Cost Export (.xlsx) — optional"
              hint="Livestream campaign data export — matched by Room ID to fill ads cost per session"
              file={adsCostFile}
              onPick={setAdsCostFile}
              inputRef={adsCostRef}
              accept=".xlsx"
            />
          )}

          {/* ── Product Performance file ── */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem", marginTop: "0.25rem" }}>
            <p className="text-xs font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>
              Product Performance — optional
            </p>
            <FileSlot
              label={platform === "TIKTOK" ? "TikTok Product Export (.xlsx)" : "Shopee Product Export (.xlsx / .csv)"}
              hint={platform === "TIKTOK"
                ? "Columns: Product Info · Gross Revenue · Unit Sales"
                : "Columns: Product(s) · Product Clicks · ATC · Orders(Confirmed Order) · Items Sold(Confirmed Order) · Sales(Confirmed Order)"}
              file={productFile}
              onPick={setProductFile}
              inputRef={productRef}
              accept=".xlsx,.xls,.csv"
            />
          </div>

          {error && <ErrorBanner message={error} />}

          <div className="flex justify-end">
            <Button onClick={handlePreview} loading={loading} disabled={!brandId || !sessionsFile}>
              Preview import <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Preview ── */}
      {step === "preview" && (
        <div className="space-y-4">
          <Button variant="ghost" onClick={() => setStep("upload")}>← Back</Button>

          {/* Summary bar */}
          <div className="section-card px-4 py-3 flex items-center gap-6 flex-wrap">
            <Stat label="Raw file rows" value={preview.length} />
            <StatStr label="Raw GMV" value={`RM ${preview.reduce((s, p) => s + p.gmv, 0).toLocaleString("en-MY", { maximumFractionDigits: 2 })}`} />
            <StatStr label="Raw Hours" value={`${(preview.reduce((s, p) => s + (p.duration ?? 0), 0) / 60).toFixed(1)}h`} />
            <div style={{ width: 1, height: 24, background: "var(--border)", flexShrink: 0 }} />
            <Stat label="Host matched" value={preview.filter(p => p.hostId).length} color="#22c55e" />
            <div className="flex items-center gap-1.5">
              <Stat label="Unmatched" value={unmatchedRows.length} color={unmatchedRows.length > 0 ? "#ef4444" : undefined} />
              {(unmatchedRows.length > 0 || showUnmatchedOnly) && (
                <button
                  onClick={() => setShowUnmatchedOnly(v => !v)}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer transition-all"
                  style={{
                    background: showUnmatchedOnly ? "rgba(239,68,68,.2)" : "rgba(239,68,68,.08)",
                    color: "#ef4444",
                    border: `1px solid ${showUnmatchedOnly ? "rgba(239,68,68,.5)" : "rgba(239,68,68,.2)"}`,
                  }}
                >
                  {showUnmatchedOnly ? "Show all" : "Filter"}
                </button>
              )}
            </div>
            <Stat label="Campaign days" value={visiblePreview.filter(p => p.isCampaign).length} color="#a855f7" />
            {testCount > 0 && <Stat label="Test sessions (<15min)" value={testCount} color="#f59e0b" />}
            <div className="ml-auto flex items-center gap-2">
              {testCount > 0 && (
                <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                  <input type="checkbox" checked={excludeTests} onChange={e => setExcludeTests(e.target.checked)} />
                  Exclude test sessions
                </label>
              )}
            </div>
          </div>

          {unmatchedRows.length > 0 && (
            <div className="section-card px-4 py-3 flex gap-3 items-start"
              style={{ background: "rgba(239,68,68,.06)", borderColor: "rgba(239,68,68,.2)" }}>
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" style={{ color: "#ef4444" }} />
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                <strong style={{ color: "#ef4444" }}>{unmatchedRows.length} session{unmatchedRows.length !== 1 ? "s" : ""} could not be matched to a host.</strong>{" "}
                Assign a host below before confirming — unassigned sessions will be skipped.
              </p>
            </div>
          )}

          {/* Preview table */}
          <div className="section-card overflow-hidden">
            {someSelected && (
              <div className="flex items-center gap-3 px-4 py-2 border-b" style={{ borderColor: "var(--border)", background: "rgba(239,68,68,.06)" }}>
                <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  {selectedKeys.size} row{selectedKeys.size !== 1 ? "s" : ""} selected
                </span>
                <button
                  onClick={removeSelected}
                  className="text-xs font-semibold px-3 py-1 rounded"
                  style={{ background: "rgba(239,68,68,.15)", color: "#ef4444" }}
                >
                  Remove selected
                </button>
                <button
                  onClick={() => setSelectedKeys(new Set())}
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  Clear selection
                </button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{ background: "var(--bg-subtle)", borderBottom: "1px solid var(--border)" }}>
                    <th className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                        onChange={toggleSelectAll}
                        className="cursor-pointer"
                      />
                    </th>
                    {["Title","Start (MYT)","End (MYT)","Duration","Host","Campaign","GMV","Slot"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-secondary)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visiblePreview.map((p) => {
                    const assignedHostId = hostOverrides[p.key] ?? p.hostId;
                    const assignedHostName = assignedHostId
                      ? (hosts.find(h => h.id === assignedHostId)?.displayName ?? p.hostName)
                      : null;
                    const isSelected = selectedKeys.has(p.key);

                    return (
                      <tr key={p.key}
                        className="border-b"
                        style={{
                          borderColor: "var(--border)",
                          background: isSelected
                            ? "rgba(99,102,241,.08)"
                            : !(hostOverrides[p.key] ?? p.hostId)
                            ? "rgba(239,68,68,.06)"
                            : p.likelyTest ? "rgba(245,158,11,.04)" : undefined,
                        }}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelectRow(p.key)} className="cursor-pointer" />
                        </td>
                        <td className="px-3 py-2 max-w-[200px]">
                          <p className="truncate font-medium" style={{ color: "var(--text-primary)" }}>{p.roomTitle}</p>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{fmtMYT(p.startMYT)}</td>
                        <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{fmtMYT(p.endMYT)}</td>
                        <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                          {p.duration ? `${(p.duration / 60).toFixed(2)}h` : "—"}
                          {p.likelyTest && <span className="ml-1 px-1 rounded text-[9px] font-bold" style={{ background: "rgba(245,158,11,.15)", color: "#f59e0b" }}>TEST</span>}
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            value={hostOverrides[p.key] ?? p.hostId ?? ""}
                            onChange={e => setHostOverrides(prev => ({ ...prev, [p.key]: e.target.value }))}
                          >
                            <option value="">Unassigned…</option>
                            {hosts.map(h => <option key={h.id} value={h.id}>{h.displayName}</option>)}
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            value={
                              p.key in campaignOverrides
                                ? (campaignOverrides[p.key] ? "campaign" : "bau")
                                : (p.isCampaign ? "campaign" : "bau")
                            }
                            onChange={e => setCampaignOverrides(prev => ({ ...prev, [p.key]: e.target.value === "campaign" }))}
                          >
                            <option value="bau">BAU</option>
                            <option value="campaign">{p.campaignName ?? "Campaign"}</option>
                          </Select>
                        </td>
                        <td className="px-3 py-2 font-semibold" style={{ color: "var(--text-primary)" }}>
                          {fmtRM(p.gmv)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-[10px]">
                          {p.matchedSlotTime ? (
                            <span className="px-1.5 py-0.5 rounded font-semibold" style={{ background: "rgba(34,197,94,.12)", color: "#16a34a" }}>
                              Matches {fmtMYT(p.matchedSlotTime)}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded font-semibold" style={{ background: "rgba(249,115,22,.1)", color: "#f97316" }}>
                              New session
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {error && <ErrorBanner message={error} />}

          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep("upload")}>← Back</Button>
            <Button
              onClick={handleConfirm}
              loading={loading}
              disabled={unmatchedRows.length > 0 && unmatchedRows.some(p => !(hostOverrides[p.key]))}
            >
              <CheckCircle2 size={14} />
              Confirm import ({visiblePreview.filter(p => (hostOverrides[p.key] ?? p.hostId)).length} sessions)
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Done ── */}
      {step === "done" && result && (
        <div className="section-card p-8 max-w-md space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={24} style={{ color: "#22c55e" }} />
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Import complete</h2>
          </div>
          <div className="space-y-2">
            {result.updated !== undefined && result.updated > 0 && (
              <KV label="Existing slots updated" value={String(result.updated)} />
            )}
            <KV label={platform === "SHOPEE" ? "New sessions created" : "Sessions imported"} value={String(result.inserted)} />
            <KV label="Test sessions skipped" value={String(result.skipped)} />
            <KV label="Unmatched (skipped)" value={String(result.unmatched)} />
            {result.unmatchedTitles && result.unmatchedTitles.length > 0 && (
              <div className="mt-2 p-2 rounded text-xs" style={{ background: "var(--bg-danger)", color: "var(--text-danger)" }}>
                <p className="font-semibold mb-1">Skipped — no host matched in title:</p>
                {result.unmatchedTitles.map((t, i) => <p key={i} className="truncate opacity-80">{t}</p>)}
              </div>
            )}
            {result.adsCostMatched !== undefined && (
              <KV label="Ads cost patched" value={`${result.adsCostMatched} sessions`} />
            )}
          </div>

          {/* Product import result */}
          {productResult && (
            <div className="flex items-center gap-2 text-sm rounded-lg px-3 py-2.5"
              style={{ background: "rgba(34,197,94,.08)", color: "#16a34a", border: "1px solid rgba(34,197,94,.3)" }}>
              <CheckCircle2 size={14} className="flex-shrink-0" />
              Product data imported — {productResult.count} products
            </div>
          )}
          {productError && (
            <div className="flex items-center gap-2 text-sm rounded-lg px-3 py-2.5"
              style={{ background: "var(--bg-danger)", color: "var(--text-danger)", border: "1px solid var(--border-danger)" }}>
              <AlertCircle size={14} className="flex-shrink-0" />
              Product import: {productError}
            </div>
          )}

          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Data is live in the dashboard.{" "}
            Matched sessions updated existing admin-created slots with actuals and punctuality. Unmatched rows created as new sessions.{" "}
            Other months and other platform data are untouched.
          </p>
          <div className="flex gap-2 pt-2">
            <Button onClick={reset}>Import another month</Button>
          </div>
        </div>
      )}
      </> }
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FileSlot({ label, hint, file, onPick, inputRef, accept, required }: {
  label: string; hint: string; file: File | null;
  onPick: (f: File | null) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  accept?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
        {label} {required && <span style={{ color: "#ef4444" }}>*</span>}
      </label>
      <div className="flex items-center gap-2">
        <label className="flex-1 px-3 py-2 rounded-lg text-sm cursor-pointer flex items-center gap-2"
          style={{ background: "var(--bg-subtle)", border: `1px solid ${file ? "var(--accent)" : "var(--border)"}` }}>
          <FileText size={14} style={{ color: file ? "var(--accent)" : "var(--text-muted)" }} />
          <span style={{ color: file ? "var(--text-primary)" : "var(--text-muted)" }}>
            {file?.name ?? "Choose file…"}
          </span>
          <input ref={inputRef} type="file" accept={accept} className="hidden"
            onChange={e => onPick(e.target.files?.[0] ?? null)} />
        </label>
        {file && (
          <button onClick={() => { onPick(null); if (inputRef.current) inputRef.current.value = ""; }}
            className="p-1.5 rounded-lg" style={{ color: "var(--text-muted)", background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
            <X size={13} />
          </button>
        )}
      </div>
      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{hint}</p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-sm"
      style={{ background: "rgba(239,68,68,.08)", color: "#ef4444" }}>
      <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div className="text-lg font-bold" style={{ color: color ?? "var(--text-primary)" }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

function StatStr({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-lg font-bold" style={{ color: color ?? "var(--text-primary)" }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm py-1" style={{ borderBottom: "1px solid var(--border)" }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}
