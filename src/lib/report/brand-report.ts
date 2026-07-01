import PptxGenJS from "pptxgenjs";
import { readFileSync } from "fs";
import { join } from "path";
import JSZip from "jszip";

const NAVY   = "2A2968";
const NAVY2  = "1E1D4E";
const WHITE  = "FFFFFF";
const LGRAY  = "F4F4FB";
const ACCENT = "4F4CB0";
const GREEN  = "16A34A";
const RED    = "DC2626";
const AMBER  = "D97706";

const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

function rm(v: number) {
  return "RM " + v.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function mom(cur: number, prev: number) {
  if (!prev) return "—";
  const d = ((cur - prev) / prev) * 100;
  return (d >= 0 ? "+" : "") + d.toFixed(1) + "%";
}
function momColor(cur: number, prev: number) {
  if (!prev) return "888888";
  return cur >= prev ? GREEN : RED;
}
function pctDiff(cur: number, avg: number) {
  if (!avg) return "—";
  const d = ((cur - avg) / avg) * 100;
  return (d >= 0 ? "+" : "") + d.toFixed(1) + "%";
}
function pctDiffColor(cur: number, avg: number) {
  if (!avg) return "888888";
  return cur >= avg ? GREEN : RED;
}

export interface ReportInput {
  brandId: string;
  brandName: string;
  platform: string;
  month: number;
  year: number;

  current: {
    totalGMV: number; totalHours: number; totalSessions: number;
    totalOrders: number; totalViewers: number;
    bauGMV: number; bauHours: number; bauSessions: number;
    campGMV: number; campHours: number; campSessions: number;
    weeklyGMV: number[]; weekLabels: string[];
  };
  prev: {
    totalGMV: number; totalHours: number; totalSessions: number;
    bauGMV: number; bauHours: number; campGMV: number; campHours: number;
  };

  monthlyAvgGmv: number;
  monthlyAvgGmvPerHour: number;

  bestSession: {
    date: string; hostName: string; gmv: number; hours: number;
    gmvPerHour: number; orders: number; viewers: number;
    adsSpent: number; type: string;
    scheduledStart: string; actualStart: string | null; punctuality: string | null;
  };
  worstSession: {
    date: string; hostName: string; gmv: number; hours: number;
    gmvPerHour: number; adsSpent: number; viewers: number; type: string;
    scheduledStart: string; actualStart: string | null; punctuality: string | null;
  };

  hosts: { name: string; gmv: number; hours: number; gmvPerHour: number; sessions: number; }[];

  products: { productName: string; gmv: number; unitsSold: number; orders: number; clicks: number; convRate: number | null; }[];

  notes: {
    bestPerformance?: string;
    worstImprovement?: string;
    summaryOverview?: string;
    summaryNextSteps?: string;
  };
}

function getLogo(): string {
  const buf = readFileSync(join(process.cwd(), "public", "13media-logo.png"));
  return "data:image/png;base64," + buf.toString("base64");
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  // MYT = UTC+8
  const myt = new Date(d.getTime() + 8 * 3600_000);
  return myt.toISOString().slice(11, 16);
}

function punctualityLabel(p: string | null): string {
  if (!p) return "—";
  if (p === "EARLY")   return "Early";
  if (p === "ON_TIME") return "On Time";
  if (p === "LATE")    return "Late";
  return p;
}
function punctualityColor(p: string | null): string {
  if (p === "EARLY")   return "6366F1";
  if (p === "ON_TIME") return GREEN;
  if (p === "LATE")    return AMBER;
  return "888888";
}

export async function generateBrandReport(input: ReportInput): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 10, height: 5.62 });
  pptx.layout = "WIDE";
  pptx.author = "13 Media";
  pptx.company = "13 Media";

  const logo = getLogo();
  const monthLabel = MONTHS[input.month - 1];
  const prevMonth  = input.month === 1 ? 12 : input.month - 1;
  const prevLabel  = MONTHS[prevMonth - 1];
  const isTikTok   = input.platform.toUpperCase().includes("TIKTOK");

  // ── Rounded card helper ──────────────────────────────────────────────────
  function rCard(s: PptxGenJS.Slide, x: number, y: number, w: number, h: number, fill = LGRAY, stroke = "E0E0F0") {
    s.addShape("roundRect" as any, {
      x, y, w, h,
      rectRadius: 0.12,
      fill: { color: fill },
      line: { color: stroke, pt: 0.6 },
    });
  }

  // ── Stat card: label top, big value, small sub-label ─────────────────────
  function statCard(
    s: PptxGenJS.Slide, x: number, y: number, w: number, h: number,
    label: string, value: string, sub?: string,
    fillHex = LGRAY, valueColor = NAVY, strokeHex = "E0E0F0"
  ) {
    rCard(s, x, y, w, h, fillHex, strokeHex);
    s.addText(label, { x: x + 0.12, y: y + 0.08, w: w - 0.24, h: 0.22, fontSize: 7.5, color: "777777", fontFace: "Arial" });
    s.addText(value, { x: x + 0.12, y: y + 0.28, w: w - 0.24, h: 0.36, fontSize: 14, bold: true, color: valueColor, fontFace: "Arial" });
    if (sub) {
      s.addText(sub, { x: x + 0.12, y: y + 0.62, w: w - 0.24, h: 0.18, fontSize: 7, color: "999999", fontFace: "Arial" });
    }
  }

  // ── Common frame (header bar + footer + logo) ────────────────────────────
  function frame(slide: PptxGenJS.Slide, title: string) {
    // Header rounded bar
    slide.addShape("roundRect" as any, {
      x: 0.16, y: 0.1, w: 9.68, h: 0.62,
      rectRadius: 0.1,
      fill: { color: NAVY2 },
      line: { color: NAVY2 },
    });
    slide.addText(title, {
      x: 0.32, y: 0.1, w: 8.8, h: 0.62,
      fontSize: 16, bold: true, color: WHITE,
      align: "left", valign: "middle", fontFace: "Arial",
    });
    // Footer bar
    slide.addShape("roundRect" as any, {
      x: 0.16, y: 5.3, w: 9.68, h: 0.22,
      rectRadius: 0.05,
      fill: { color: NAVY },
      line: { color: NAVY },
    });
    slide.addImage({ data: logo, x: 9.3, y: 0.12, w: 0.5, h: 0.42 });
  }

  // ── SLIDE 1 — COVER ──────────────────────────────────────────────────────
  {
    const s = pptx.addSlide();
    s.addShape("rect" as any, { x: 0, y: 0, w: 10, h: 5.62, fill: { color: "0F0E2E" }, line: { color: "0F0E2E" } });
    s.addShape("rect" as any, { x: 0, y: 5.37, w: 10, h: 0.25, fill: { color: NAVY }, line: { color: NAVY } });
    s.addShape("rect" as any, { x: 0, y: 0, w: 10, h: 0.12, fill: { color: NAVY }, line: { color: NAVY } });

    s.addImage({ data: logo, x: 0.5, y: 0.28, w: 0.85, h: 0.72 });

    s.addShape("roundRect" as any, { x: 0.5, y: 1.42, w: 2.6, h: 0.32, rectRadius: 0.08, fill: { color: "3A3880" }, line: { color: "3A3880" } });
    s.addText(input.platform.toUpperCase(), { x: 0.5, y: 1.42, w: 2.6, h: 0.32, fontSize: 11, bold: true, color: WHITE, align: "center", fontFace: "Arial" });

    s.addText("MONTHLY REPORT",           { x: 0.5, y: 1.88, w: 9, h: 0.6,  fontSize: 34, bold: true, color: WHITE,     align: "left", fontFace: "Arial" });
    s.addText(`${input.platform.toUpperCase()} LIVESTREAM`, { x: 0.5, y: 2.44, w: 9, h: 0.55, fontSize: 28, bold: true, color: "A5B4FC", align: "left", fontFace: "Arial" });
    s.addText(input.brandName.toUpperCase(), { x: 0.5, y: 3.08, w: 9, h: 0.56, fontSize: 22, bold: true, color: WHITE,     align: "left", fontFace: "Arial" });
    s.addText(`${monthLabel}  ·  ${input.year}`, { x: 0.5, y: 3.72, w: 9, h: 0.42, fontSize: 16, color: "94A3B8", align: "left", fontFace: "Arial" });
    s.addText("Digital   |   Social Commerce   |   E-Commerce   |   Marketing", { x: 0, y: 4.88, w: 10, h: 0.35, fontSize: 10, color: "94A3B8", align: "center", fontFace: "Arial" });
  }

  // ── SLIDE 2 — LIVESTREAM OVERVIEW (MoM table) ───────────────────────────
  {
    const s = pptx.addSlide();
    frame(s, "LIVESTREAM OVERVIEW");

    const c = input.current, p = input.prev;
    const cGMVph = c.totalHours > 0 ? c.totalGMV / c.totalHours : 0;
    const pGMVph = p.totalHours > 0 ? p.totalGMV / p.totalHours : 0;

    // Table container card
    rCard(s, 0.2, 0.88, 9.6, 4.54, "F9F9FF", "D8D8F0");

    const H   = { bold: true, color: WHITE, fill: { color: NAVY }, fontSize: 9.5, fontFace: "Arial", align: "center" as const, valign: "middle" as const };
    const C   = { fontSize: 9.5, color: "111111", fontFace: "Arial", align: "center" as const, valign: "middle" as const };
    const L   = { ...C, bold: true, align: "left" as const };
    const MOM = (cur: number, prev: number) => ({ ...C, bold: true, color: momColor(cur, prev) });
    const ALT = "EEEEFF";

    const rows: any[][] = [
      [
        { text: "Metric",         options: H },
        { text: prevLabel,        options: H },
        { text: monthLabel,       options: H },
        { text: "MoM (%)",        options: H },
      ],
      [{ text: "Total GMV",    options: L },              { text: rm(p.totalGMV),             options: C },         { text: rm(c.totalGMV),             options: { ...C, bold: true } }, { text: mom(c.totalGMV, p.totalGMV),     options: MOM(c.totalGMV, p.totalGMV) }],
      [{ text: "Total Hours",  options: L },              { text: p.totalHours.toFixed(1)+"h", options: C },         { text: c.totalHours.toFixed(1)+"h", options: C },                   { text: mom(c.totalHours, p.totalHours), options: MOM(c.totalHours, p.totalHours) }],
      [{ text: "GMV / Hour",   options: L },              { text: rm(pGMVph),                 options: C },         { text: rm(cGMVph),                 options: { ...C, bold: true } }, { text: mom(cGMVph, pGMVph),             options: MOM(cGMVph, pGMVph) }],
      [{ text: "Sessions",     options: L },              { text: String(p.totalSessions),     options: C },         { text: String(c.totalSessions),     options: C },                   { text: mom(c.totalSessions, p.totalSessions), options: MOM(c.totalSessions, p.totalSessions) }],
      [{ text: "BAU GMV",      options: { ...L, fill: { color: ALT } } }, { text: rm(p.bauGMV),  options: { ...C, fill: { color: ALT } } }, { text: rm(c.bauGMV),  options: { ...C, fill: { color: ALT } } }, { text: mom(c.bauGMV, p.bauGMV),   options: { ...MOM(c.bauGMV, p.bauGMV),   fill: { color: ALT } } }],
      [{ text: "BAU Hours",    options: L },              { text: p.bauHours.toFixed(1)+"h",  options: C },         { text: c.bauHours.toFixed(1)+"h",  options: C },                   { text: mom(c.bauHours, p.bauHours),     options: MOM(c.bauHours, p.bauHours) }],
      [{ text: "Campaign GMV", options: { ...L, fill: { color: ALT } } }, { text: rm(p.campGMV), options: { ...C, fill: { color: ALT } } }, { text: rm(c.campGMV), options: { ...C, fill: { color: ALT } } }, { text: mom(c.campGMV, p.campGMV), options: { ...MOM(c.campGMV, p.campGMV), fill: { color: ALT } } }],
      [{ text: "Camp. Hours",  options: L },              { text: p.campHours.toFixed(1)+"h", options: C },         { text: c.campHours.toFixed(1)+"h", options: C },                   { text: mom(c.campHours, p.campHours),   options: MOM(c.campHours, p.campHours) }],
    ];

    s.addTable(rows, {
      x: 0.35, y: 0.98, w: 9.3, h: 4.24,
      colW: [2.6, 2.1, 2.1, 2.0],
      border: { type: "solid", color: "D8D8F0", pt: 0.5 },
      rowH: 0.44,
    });
  }

  // ── SLIDE 3 — WEEKLY GMV TREND ───────────────────────────────────────────
  {
    const s = pptx.addSlide();
    frame(s, `WEEKLY GMV TREND — ${monthLabel.toUpperCase()} ${input.year}`);

    // Chart container
    rCard(s, 0.2, 0.88, 9.6, 4.32, "F9F9FF", "D8D8F0");

    s.addChart("bar" as any, [{
      name: "GMV",
      labels: input.current.weekLabels,
      values: input.current.weeklyGMV,
    }], {
      x: 0.45, y: 0.98, w: 9.1, h: 4.12,
      chartColors: [NAVY],
      barDir: "col",
      showValue: true,
      dataLabelFontSize: 9,
      dataLabelFontBold: true,
      dataLabelColor: NAVY,
      dataLabelPosition: "outEnd",
      valAxisMinVal: 0,
      showLegend: false,
      valAxisMajorGridlines: { style: "dash", color: "E0E0F0" },
      catAxisLabelFontSize: 13,
      catAxisLabelFontBold: true,
      catAxisLabelColor: "333333",
    } as any);
  }

  // ── SLIDE 4 — BAU vs CAMPAIGN ────────────────────────────────────────────
  {
    const s = pptx.addSlide();
    frame(s, "BAU vs CAMPAIGN BREAKDOWN");

    const c = input.current;
    const bauGMVph  = c.bauHours  > 0 ? c.bauGMV  / c.bauHours  : 0;
    const campGMVph = c.campHours > 0 ? c.campGMV / c.campHours : 0;

    // Left section card
    rCard(s, 0.2, 0.9, 4.55, 3.3, "F9F9FF", "D8D8F0");
    s.addText("BAU (Normal Days)", { x: 0.4, y: 0.98, w: 4.1, h: 0.28, fontSize: 11, bold: true, color: NAVY, fontFace: "Arial" });
    statCard(s, 0.32, 1.3,  2.0, 0.82, "GMV",      rm(c.bauGMV));
    statCard(s, 2.42, 1.3,  2.2, 0.82, "GMV/Hour", rm(bauGMVph));
    statCard(s, 0.32, 2.2,  2.0, 0.82, "Hours",    c.bauHours.toFixed(1) + "h");
    statCard(s, 2.42, 2.2,  2.2, 0.82, "Sessions", String(c.bauSessions));

    // Right section card
    rCard(s, 5.05, 0.9, 4.75, 3.3, "F0FFF4", "BBF7D0");
    s.addText("Campaign Days", { x: 5.25, y: 0.98, w: 4.3, h: 0.28, fontSize: 11, bold: true, color: NAVY, fontFace: "Arial" });
    statCard(s, 5.17, 1.3,  2.1, 0.82, "GMV",      rm(c.campGMV),     undefined, "E8F5E9", NAVY, "BBF7D0");
    statCard(s, 7.37, 1.3,  2.3, 0.82, "GMV/Hour", rm(campGMVph),     undefined, "E8F5E9", NAVY, "BBF7D0");
    statCard(s, 5.17, 2.2,  2.1, 0.82, "Hours",    c.campHours.toFixed(1) + "h");
    statCard(s, 7.37, 2.2,  2.3, 0.82, "Sessions", String(c.campSessions));

    // Donut chart container
    rCard(s, 0.2, 4.28, 9.6, 0.86, "F9F9FF", "D8D8F0");
    s.addText("GMV Contribution", { x: 0.35, y: 4.34, w: 2.2, h: 0.22, fontSize: 8.5, bold: true, color: NAVY, fontFace: "Arial", valign: "middle" });
    s.addChart("doughnut" as any, [{
      name: "GMV Split",
      labels: ["BAU", "Campaign"],
      values: [c.bauGMV || 1, c.campGMV || 0],
    }], {
      x: 2.5, y: 4.15, w: 7.1, h: 1.2,
      chartColors: [NAVY, "4CAF50"],
      holeSize: 55,
      showLegend: true, legendPos: "r", legendFontSize: 9,
      showPercent: true, dataLabelFontSize: 9, dataLabelFontBold: true,
    } as any);
  }

  // ── SLIDE 5 — BEST PERFORMING SESSION ───────────────────────────────────
  {
    const s = pptx.addSlide();
    frame(s, "BEST PERFORMING SESSION");

    const bs = input.bestSession;
    const avgGmv    = input.monthlyAvgGmv;
    const avgGmvPh  = input.monthlyAvgGmvPerHour;
    const roas      = bs.adsSpent > 0 ? bs.gmv / bs.adsSpent : null;
    const netRev    = bs.gmv - bs.adsSpent;
    const punctColor = punctualityColor(bs.punctuality);

    // ── Left panel: stat cards ───────────────────────────────────────────
    rCard(s, 0.2, 0.88, 4.6, 4.3, "F9FFF9", "BBF7D0");

    // Session tag
    s.addShape("roundRect" as any, {
      x: 0.32, y: 0.98, w: 4.36, h: 0.3,
      rectRadius: 0.06,
      fill: { color: "EEFBF0" },
      line: { color: "22C55E", pt: 0.8 },
    });
    s.addText(`✓  ${bs.hostName}  ·  ${bs.date}  ·  ${bs.type}`, {
      x: 0.38, y: 0.98, w: 4.24, h: 0.3, fontSize: 8.5, bold: true, color: GREEN, fontFace: "Arial",
    });

    // Core metrics grid (2 columns)
    statCard(s, 0.32, 1.36, 2.1, 0.82, "GMV",          rm(bs.gmv));
    statCard(s, 2.52, 1.36, 2.16, 0.82, "GMV / Hour",  rm(bs.gmvPerHour));
    statCard(s, 0.32, 2.26, 2.1, 0.82, "Duration",     bs.hours.toFixed(1) + "h");
    statCard(s, 2.52, 2.26, 2.16, 0.82, "Orders",      bs.orders > 0 ? bs.orders.toLocaleString() : "—");
    statCard(s, 0.32, 3.16, 2.1, 0.82, "Peak Viewers", bs.viewers > 0 ? bs.viewers.toLocaleString() : "—");

    // TikTok-only: ROAS + Net Revenue
    if (isTikTok) {
      statCard(s, 2.52, 3.16, 2.16, 0.82, "ROAS",        roas !== null ? roas.toFixed(2) + "×" : "N/A", undefined, roas && roas >= 1 ? "EEFBF0" : LGRAY, roas && roas >= 1 ? GREEN : NAVY, roas && roas >= 1 ? "BBF7D0" : "E0E0F0");
      statCard(s, 0.32, 4.06, 4.36, 0.82, "Net Revenue", rm(netRev > 0 ? netRev : 0), undefined, "EEFBF0", GREEN, "BBF7D0");
    } else {
      statCard(s, 2.52, 3.16, 2.16, 0.82, "Orders / Hour", bs.hours > 0 ? (bs.orders / bs.hours).toFixed(1) : "—");
      // Notes if present
      if (input.notes.bestPerformance) {
        rCard(s, 0.32, 4.06, 4.36, 1.05, "F8F8FF", "C7C7E8");
        s.addText("WHAT WORKED:", { x: 0.44, y: 4.12, w: 4.1, h: 0.22, fontSize: 7.5, bold: true, color: NAVY, fontFace: "Arial" });
        s.addText(input.notes.bestPerformance, { x: 0.44, y: 4.34, w: 4.1, h: 0.72, fontSize: 7.5, color: "333333", fontFace: "Arial", valign: "top" });
      }
    }

    // Notes (TikTok — below ROAS row)
    if (isTikTok && input.notes.bestPerformance) {
      // notes are shown in right panel below
    }

    // ── Right panel ──────────────────────────────────────────────────────
    const RX = 5.0;
    rCard(s, RX, 0.88, 4.8, 4.3, "F9F9FF", "D8D8F0");

    // Section: vs Monthly Average
    s.addText("vs Monthly Average", { x: RX + 0.15, y: 0.96, w: 4.5, h: 0.24, fontSize: 9, bold: true, color: NAVY, fontFace: "Arial" });

    // Chart container for comparison bar
    rCard(s, RX + 0.12, 1.22, 4.56, 1.4, WHITE, "E0E0F0");

    s.addChart("bar" as any, [{
      name: "This Session",
      labels: ["GMV", "GMV/Hour"],
      values: [bs.gmv, bs.gmvPerHour],
    }, {
      name: "Monthly Avg",
      labels: ["GMV", "GMV/Hour"],
      values: [avgGmv, avgGmvPh],
    }], {
      x: RX + 0.14, y: 1.24, w: 4.52, h: 1.36,
      chartColors: [NAVY, "A5B4FC"],
      barDir: "col",
      barGrouping: "clustered",
      showLegend: true, legendPos: "t", legendFontSize: 7,
      showValue: true, dataLabelFontSize: 7, dataLabelFontBold: true,
      valAxisMinVal: 0,
      catAxisLabelFontSize: 8,
      valAxisMajorGridlines: { style: "dash", color: "E8E8F8" },
    } as any);

    // Delta badges
    const gmvDelta   = pctDiff(bs.gmv, avgGmv);
    const gmvphDelta = pctDiff(bs.gmvPerHour, avgGmvPh);
    statCard(s, RX + 0.12, 2.7, 2.2, 0.62, "GMV vs Avg",      gmvDelta,   undefined, "EEEEFF", pctDiffColor(bs.gmv, avgGmv) as string, "C7C7E8");
    statCard(s, RX + 2.42, 2.7, 2.26, 0.62, "GMV/Hr vs Avg",  gmvphDelta, undefined, "EEEEFF", pctDiffColor(bs.gmvPerHour, avgGmvPh) as string, "C7C7E8");

    // Section: Session Timeline
    s.addText("Session Timeline", { x: RX + 0.15, y: 3.44, w: 4.5, h: 0.24, fontSize: 9, bold: true, color: NAVY, fontFace: "Arial" });
    rCard(s, RX + 0.12, 3.7, 4.56, 1.38, WHITE, "E0E0F0");

    const schedTime  = formatTime(bs.scheduledStart);
    const actualTime = formatTime(bs.actualStart);
    statCard(s, RX + 0.2,  3.78, 1.38, 0.82, "Scheduled",  schedTime);
    statCard(s, RX + 1.66, 3.78, 1.38, 0.82, "Actual Start", actualTime);
    statCard(s, RX + 3.12, 3.78, 1.36, 0.82, "Punctuality", punctualityLabel(bs.punctuality), undefined, LGRAY, punctColor);

    // Best performance notes (right panel, TikTok)
    if (isTikTok && input.notes.bestPerformance) {
      rCard(s, RX + 0.12, 5.1, 4.56, 0.0, "F8F8FF", "C7C7E8"); // hidden, no room — notes go to summary
    }
  }

  // ── SLIDE 6 — WEAKEST PERFORMING SESSION ────────────────────────────────
  {
    const s = pptx.addSlide();
    frame(s, "WEAKEST PERFORMING SESSION");

    const ws = input.worstSession;
    const avgGmv   = input.monthlyAvgGmv;
    const avgGmvPh = input.monthlyAvgGmvPerHour;
    const roas     = ws.adsSpent > 0 ? ws.gmv / ws.adsSpent : null;
    const netRev   = ws.gmv - ws.adsSpent;
    const punctColor = punctualityColor(ws.punctuality);

    // ── Left panel ───────────────────────────────────────────────────────
    rCard(s, 0.2, 0.88, 4.6, 4.3, "FFF8F8", "FECACA");

    s.addShape("roundRect" as any, {
      x: 0.32, y: 0.98, w: 4.36, h: 0.3,
      rectRadius: 0.06,
      fill: { color: "FFF0F0" },
      line: { color: "EF4444", pt: 0.8 },
    });
    s.addText(`⚠  ${ws.hostName}  ·  ${ws.date}  ·  ${ws.type}`, {
      x: 0.38, y: 0.98, w: 4.24, h: 0.3, fontSize: 8.5, bold: true, color: "B91C1C", fontFace: "Arial",
    });

    statCard(s, 0.32, 1.36, 2.1,  0.82, "GMV",          rm(ws.gmv),         undefined, "FFF0F0", RED, "FECACA");
    statCard(s, 2.52, 1.36, 2.16, 0.82, "GMV / Hour",   rm(ws.gmvPerHour),  undefined, "FFF0F0", RED, "FECACA");
    statCard(s, 0.32, 2.26, 2.1,  0.82, "Duration",     ws.hours.toFixed(1) + "h");
    statCard(s, 2.52, 2.26, 2.16, 0.82, "Orders",       ws.viewers > 0 ? ws.viewers.toLocaleString() : "—");
    statCard(s, 0.32, 3.16, 2.1,  0.82, "Peak Viewers", ws.viewers > 0 ? ws.viewers.toLocaleString() : "—");

    if (isTikTok) {
      statCard(s, 2.52, 3.16, 2.16, 0.82, "ROAS",        roas !== null ? roas.toFixed(2) + "×" : "N/A", undefined, roas !== null && roas < 1 ? "FFF0F0" : LGRAY, roas !== null && roas < 1 ? RED : NAVY, roas !== null && roas < 1 ? "FECACA" : "E0E0F0");
      statCard(s, 0.32, 4.06, 4.36, 0.82, "Net Revenue (after ads)", rm(netRev > 0 ? netRev : 0), undefined, netRev <= 0 ? "FFF0F0" : LGRAY, netRev <= 0 ? RED : NAVY, netRev <= 0 ? "FECACA" : "E0E0F0");
    } else {
      statCard(s, 2.52, 3.16, 2.16, 0.82, "Orders / Hour", ws.hours > 0 ? (ws.viewers / ws.hours).toFixed(1) : "—");
      if (input.notes.worstImprovement) {
        rCard(s, 0.32, 4.06, 4.36, 1.05, "FFF8F8", "FECACA");
        s.addText("IMPROVEMENTS:", { x: 0.44, y: 4.12, w: 4.1, h: 0.22, fontSize: 7.5, bold: true, color: RED, fontFace: "Arial" });
        s.addText(input.notes.worstImprovement, { x: 0.44, y: 4.34, w: 4.1, h: 0.72, fontSize: 7.5, color: "333333", fontFace: "Arial", valign: "top" });
      }
    }

    // ── Right panel ──────────────────────────────────────────────────────
    const RX = 5.0;
    rCard(s, RX, 0.88, 4.8, 4.3, "F9F9FF", "D8D8F0");

    s.addText("vs Monthly Average", { x: RX + 0.15, y: 0.96, w: 4.5, h: 0.24, fontSize: 9, bold: true, color: NAVY, fontFace: "Arial" });

    rCard(s, RX + 0.12, 1.22, 4.56, 1.4, WHITE, "E0E0F0");
    s.addChart("bar" as any, [{
      name: "This Session",
      labels: ["GMV", "GMV/Hour"],
      values: [ws.gmv, ws.gmvPerHour],
    }, {
      name: "Monthly Avg",
      labels: ["GMV", "GMV/Hour"],
      values: [avgGmv, avgGmvPh],
    }], {
      x: RX + 0.14, y: 1.24, w: 4.52, h: 1.36,
      chartColors: [RED, "A5B4FC"],
      barDir: "col",
      barGrouping: "clustered",
      showLegend: true, legendPos: "t", legendFontSize: 7,
      showValue: true, dataLabelFontSize: 7, dataLabelFontBold: true,
      valAxisMinVal: 0,
      catAxisLabelFontSize: 8,
      valAxisMajorGridlines: { style: "dash", color: "E8E8F8" },
    } as any);

    const gmvDelta   = pctDiff(ws.gmv, avgGmv);
    const gmvphDelta = pctDiff(ws.gmvPerHour, avgGmvPh);
    statCard(s, RX + 0.12, 2.7, 2.2, 0.62, "GMV vs Avg",     gmvDelta,   undefined, "FEEEF0", pctDiffColor(ws.gmv, avgGmv) as string, "FECACA");
    statCard(s, RX + 2.42, 2.7, 2.26, 0.62, "GMV/Hr vs Avg", gmvphDelta, undefined, "FEEEF0", pctDiffColor(ws.gmvPerHour, avgGmvPh) as string, "FECACA");

    s.addText("Session Timeline", { x: RX + 0.15, y: 3.44, w: 4.5, h: 0.24, fontSize: 9, bold: true, color: NAVY, fontFace: "Arial" });
    rCard(s, RX + 0.12, 3.7, 4.56, 1.38, WHITE, "E0E0F0");

    const schedTime  = formatTime(ws.scheduledStart);
    const actualTime = formatTime(ws.actualStart);
    statCard(s, RX + 0.2,  3.78, 1.38, 0.82, "Scheduled",   schedTime);
    statCard(s, RX + 1.66, 3.78, 1.38, 0.82, "Actual Start", actualTime);
    statCard(s, RX + 3.12, 3.78, 1.36, 0.82, "Punctuality",  punctualityLabel(ws.punctuality), undefined, LGRAY, punctColor);

    // Improvements note (TikTok, right panel bottom)
    if (isTikTok && input.notes.worstImprovement) {
      rCard(s, RX + 0.12, 5.12, 4.56, 0.0, "FFF8F8", "FECACA");
    }
  }

  // ── SLIDE 7 — LIVE HOST OVERVIEW ────────────────────────────────────────
  {
    const s = pptx.addSlide();
    frame(s, "LIVE HOST OVERVIEW");

    rCard(s, 0.2, 0.88, 9.6, 4.32, "F9F9FF", "D8D8F0");

    const H = { bold: true, color: WHITE, fill: { color: NAVY }, fontSize: 10, fontFace: "Arial", align: "center" as const, valign: "middle" as const };
    const C = { fontSize: 10, color: "111111", fontFace: "Arial", align: "center" as const, valign: "middle" as const };

    const rows: any[][] = [
      [
        { text: "Host",      options: { ...H, align: "left" as const } },
        { text: "GMV",       options: H },
        { text: "Hours",     options: H },
        { text: "GMV/Hour",  options: H },
        { text: "Sessions",  options: H },
      ],
      ...input.hosts.map((h, i) => {
        const bg = i % 2 === 0 ? WHITE : "F9F9FF";
        return [
          { text: h.name,                options: { ...C, bold: true, align: "left" as const, fill: { color: bg } } },
          { text: rm(h.gmv),             options: { ...C, fill: { color: bg } } },
          { text: h.hours.toFixed(1)+"h", options: { ...C, fill: { color: bg } } },
          { text: rm(h.gmvPerHour),      options: { ...C, bold: true, fill: { color: bg } } },
          { text: String(h.sessions),    options: { ...C, fill: { color: bg } } },
        ];
      }),
    ];

    const totGMV   = input.hosts.reduce((a, h) => a + h.gmv,      0);
    const totHours = input.hosts.reduce((a, h) => a + h.hours,    0);
    const totSess  = input.hosts.reduce((a, h) => a + h.sessions, 0);
    rows.push([
      { text: "TOTAL",                                        options: { ...C, bold: true, align: "left" as const, fill: { color: "EEEEFF" }, color: NAVY } },
      { text: rm(totGMV),                                     options: { ...C, bold: true, fill: { color: "EEEEFF" }, color: NAVY } },
      { text: totHours.toFixed(1)+"h",                       options: { ...C, bold: true, fill: { color: "EEEEFF" }, color: NAVY } },
      { text: rm(totHours > 0 ? totGMV / totHours : 0),     options: { ...C, bold: true, fill: { color: "EEEEFF" }, color: NAVY } },
      { text: String(totSess),                               options: { ...C, bold: true, fill: { color: "EEEEFF" }, color: NAVY } },
    ]);

    const rowH = Math.min(0.48, 4.05 / rows.length);
    s.addTable(rows, {
      x: 0.35, y: 0.98, w: 9.3, h: 4.05,
      colW: [3, 2, 1.5, 2, 0.8],
      border: { type: "solid", color: "D8D8F0", pt: 0.5 },
      rowH,
    });
  }

  // ── SLIDE 8 — PRODUCT PERFORMANCE ──────────────────────────────────────
  if (input.products.length > 0) {
    const s = pptx.addSlide();
    frame(s, "PRODUCT PERFORMANCE");

    const products = input.products.slice(0, 10);
    const totalProductGmv = products.reduce((a, p) => a + p.gmv, 0);

    // ── Left: table ───────────────────────────────────────────────────────
    rCard(s, 0.2, 0.88, 5.8, 4.32, "F9F9FF", "D8D8F0");

    const H = { bold: true, color: WHITE, fill: { color: NAVY }, fontSize: 8.5, fontFace: "Arial", align: "center" as const, valign: "middle" as const };
    const C = { fontSize: 8.5, color: "111111", fontFace: "Arial", align: "center" as const, valign: "middle" as const };
    const L = { ...C, align: "left" as const };

    const rows: any[][] = [
      [
        { text: "#",          options: { ...H, w: 0.3 } },
        { text: "Product",    options: { ...H, align: "left" as const } },
        { text: "GMV",        options: H },
        { text: "Units",      options: H },
        { text: "Conv %",     options: H },
      ],
      ...products.map((p, i) => {
        const bg = i % 2 === 0 ? WHITE : "F9F9FF";
        const sharePct = totalProductGmv > 0 ? ((p.gmv / totalProductGmv) * 100).toFixed(1) + "%" : "—";
        return [
          { text: String(i + 1),                             options: { ...C, bold: true, color: ACCENT, fill: { color: bg } } },
          { text: p.productName,                             options: { ...L, fill: { color: bg } } },
          { text: rm(p.gmv) + ` (${sharePct})`,             options: { ...C, bold: i === 0, fill: { color: bg } } },
          { text: p.unitsSold.toLocaleString(),              options: { ...C, fill: { color: bg } } },
          { text: p.convRate != null ? p.convRate.toFixed(1) + "%" : "—", options: { ...C, fill: { color: bg } } },
        ];
      }),
    ];

    const rowH = Math.min(0.46, 4.05 / rows.length);
    s.addTable(rows, {
      x: 0.35, y: 0.98, w: 5.5, h: 4.05,
      colW: [0.35, 2.35, 1.65, 0.75, 0.7],
      border: { type: "solid", color: "D8D8F0", pt: 0.5 },
      rowH,
    });

    // ── Right: GMV donut + summary stats ──────────────────────────────────
    const RX = 6.2;
    rCard(s, RX, 0.88, 3.6, 4.32, "F9F9FF", "D8D8F0");

    s.addText("GMV Share by Product", { x: RX + 0.15, y: 0.96, w: 3.3, h: 0.24, fontSize: 9, bold: true, color: NAVY, fontFace: "Arial", align: "center" });

    // Donut — top 5 products + "Others"
    const top5 = products.slice(0, 5);
    const othersGmv = products.slice(5).reduce((a, p) => a + p.gmv, 0);
    const donutLabels = [...top5.map(p => p.productName.length > 18 ? p.productName.slice(0, 17) + "…" : p.productName), ...(othersGmv > 0 ? ["Others"] : [])];
    const donutValues = [...top5.map(p => p.gmv), ...(othersGmv > 0 ? [othersGmv] : [])];
    const donutColors = [NAVY, ACCENT, "7B78D0", "A5B4FC", "C4C2E8", "CCCCCC"];

    rCard(s, RX + 0.12, 1.22, 3.36, 2.2, WHITE, "E0E0F0");
    s.addChart("doughnut" as any, [{ name: "GMV Share", labels: donutLabels, values: donutValues }], {
      x: RX + 0.14, y: 1.24, w: 3.32, h: 2.16,
      chartColors: donutColors,
      holeSize: 55,
      showLegend: true, legendPos: "b", legendFontSize: 7,
      showPercent: true, dataLabelFontSize: 8, dataLabelFontBold: true,
      dataLabelColor: WHITE,
    } as any);

    // Summary stat cards
    const totalUnits  = products.reduce((a, p) => a + p.unitsSold, 0);
    const totalOrders = products.reduce((a, p) => a + p.orders,    0);
    const avgConv     = products.filter(p => p.convRate != null).reduce((a, p, _, arr) => a + (p.convRate ?? 0) / arr.length, 0);

    statCard(s, RX + 0.12, 3.52, 1.62, 0.72, "Total GMV",    rm(totalProductGmv));
    statCard(s, RX + 1.86, 3.52, 1.62, 0.72, "Units Sold",   totalUnits.toLocaleString());
    statCard(s, RX + 0.12, 4.32, 1.62, 0.72, "Total Orders", totalOrders.toLocaleString());
    statCard(s, RX + 1.86, 4.32, 1.62, 0.72, "Avg Conv %",   avgConv > 0 ? avgConv.toFixed(1) + "%" : "—");
  }

  // ── SLIDE 9 (or 8 if no products) — SUMMARY ────────────────────────────
  {
    const s = pptx.addSlide();
    frame(s, "SUMMARY");

    const c = input.current, p = input.prev;
    const defaultOverview = [
      `Total GMV (${monthLabel}): ${rm(c.totalGMV)}`,
      `GMV/Hour: ${rm(c.totalHours > 0 ? c.totalGMV / c.totalHours : 0)}`,
      `MoM Change: ${mom(c.totalGMV, p.totalGMV)}`,
      `Total Sessions: ${c.totalSessions}`,
      `BAU GMV: ${rm(c.bauGMV)}  |  Campaign GMV: ${rm(c.campGMV)}`,
    ].join("\n");

    rCard(s, 0.2,  0.9, 4.65, 4.38, "F8F8FF", "D8D8F0");
    s.addText("OVERVIEW:", { x: 0.38, y: 1.02, w: 4.3, h: 0.28, fontSize: 10, bold: true, color: NAVY, fontFace: "Arial" });
    s.addText(input.notes.summaryOverview || defaultOverview, { x: 0.38, y: 1.34, w: 4.3, h: 3.84, fontSize: 9.5, color: "333333", fontFace: "Arial", valign: "top", paraSpaceAfter: 5 });

    rCard(s, 5.15, 0.9, 4.65, 4.38, "F8F8FF", "D8D8F0");
    s.addText("NEXT STEPS:", { x: 5.33, y: 1.02, w: 4.3, h: 0.28, fontSize: 10, bold: true, color: NAVY, fontFace: "Arial" });
    s.addText(input.notes.summaryNextSteps || "—", { x: 5.33, y: 1.34, w: 4.3, h: 3.84, fontSize: 9.5, color: "333333", fontFace: "Arial", valign: "top", paraSpaceAfter: 5 });
  }

  // ── SLIDE 9 — THANK YOU ─────────────────────────────────────────────────
  {
    const s = pptx.addSlide();
    s.addShape("rect" as any, { x: 0, y: 0, w: 10, h: 5.62, fill: { color: "0F0E2E" }, line: { color: "0F0E2E" } });
    s.addShape("rect" as any, { x: 0, y: 5.37, w: 10, h: 0.25, fill: { color: NAVY }, line: { color: NAVY } });
    s.addImage({ data: logo, x: 9.35, y: 0.05, w: 0.55, h: 0.45 });
    s.addText("THANK YOU",                                                { x: 0.5, y: 2.05, w: 9, h: 0.75, fontSize: 42, bold: true, color: WHITE,     align: "center", fontFace: "Arial" });
    s.addText(`${input.brandName}  ·  ${monthLabel} ${input.year}`,      { x: 0.5, y: 2.9,  w: 9, h: 0.42, fontSize: 15,             color: "94A3B8", align: "center", fontFace: "Arial" });
    s.addText("Digital   |   Social Commerce   |   E-Commerce   |   Marketing", { x: 0, y: 4.88, w: 10, h: 0.35, fontSize: 10, color: "94A3B8", align: "center", fontFace: "Arial" });
  }

  const buf = await pptx.write({ outputType: "nodebuffer" });
  return injectTemplateSlide(buf as unknown as Buffer);
}

// ── Inject template slide as slide 2 ────────────────────────────────────────
async function injectTemplateSlide(generatedBuf: Buffer): Promise<Buffer> {
  const templatePath = join(process.cwd(), "public", "Affiliate Presentation Format.pptx");
  let templateBuf: Buffer;
  try {
    templateBuf = readFileSync(templatePath);
  } catch {
    // Template file missing — return unmodified
    return generatedBuf;
  }

  const [genZip, tplZip] = await Promise.all([
    JSZip.loadAsync(generatedBuf),
    JSZip.loadAsync(templateBuf),
  ]);

  // ── Find the first slide in the template ──────────────────────────────────
  const tplSlideFiles = Object.keys(tplZip.files)
    .filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort();
  if (tplSlideFiles.length === 0) return generatedBuf;

  const tplSlideKey = tplSlideFiles[0]; // e.g. ppt/slides/slide1.xml
  const tplSlideXml = await tplZip.files[tplSlideKey].async("string");

  // Its rels file
  const tplRelsKey = tplSlideKey.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
  const tplRelsXml = tplZip.files[tplRelsKey]
    ? await tplZip.files[tplRelsKey].async("string")
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;

  // Copy any media/assets referenced by the template slide
  const tplMediaRefMatches = [...tplRelsXml.matchAll(/Target="([^"]+)"/g)];
  for (const m of tplMediaRefMatches) {
    const target = m[1];
    if (target.startsWith("../media/") || target.startsWith("../theme/")) {
      const srcKey = "ppt/" + target.replace(/^\.\.\//, "");
      if (tplZip.files[srcKey] && !genZip.files[srcKey]) {
        const data = await tplZip.files[srcKey].async("nodebuffer");
        genZip.file(srcKey, data);
      }
    }
    // Copy slideLayouts referenced
    if (target.includes("slideLayout")) {
      const layoutKey = "ppt/slides/" + target.replace(/^\.\.\//, "");
      const resolvedKey = layoutKey.replace("ppt/slides/../", "ppt/");
      if (tplZip.files[resolvedKey] && !genZip.files[resolvedKey]) {
        const data = await tplZip.files[resolvedKey].async("nodebuffer");
        genZip.file(resolvedKey, data);
        // Also copy the layout's rels
        const layoutRelsKey = resolvedKey.replace("ppt/slideLayouts/", "ppt/slideLayouts/_rels/") + ".rels";
        if (tplZip.files[layoutRelsKey] && !genZip.files[layoutRelsKey]) {
          const rdata = await tplZip.files[layoutRelsKey].async("nodebuffer");
          genZip.file(layoutRelsKey, rdata);
        }
      }
    }
  }

  // ── Shift existing slides in generated deck up by 1 (slide1→slide2 etc.) ──
  const genSlideKeys = Object.keys(genZip.files)
    .filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)![0]);
      const nb = parseInt(b.match(/\d+/)![0]);
      return nb - na; // descending so we don't clobber
    });

  for (const key of genSlideKeys) {
    const num = parseInt(key.match(/\d+/)![0]);
    const newKey = `ppt/slides/slide${num + 1}.xml`;
    const newRelsKey = `ppt/slides/_rels/slide${num + 1}.xml.rels`;
    const oldRelsKey = `ppt/slides/_rels/slide${num}.xml.rels`;

    const xml = await genZip.files[key].async("nodebuffer");
    genZip.file(newKey, xml);
    genZip.remove(key);

    if (genZip.files[oldRelsKey]) {
      const rxml = await genZip.files[oldRelsKey].async("nodebuffer");
      genZip.file(newRelsKey, rxml);
      genZip.remove(oldRelsKey);
    }
  }

  // ── Insert the template slide as slide2 ───────────────────────────────────
  genZip.file("ppt/slides/slide2.xml", tplSlideXml);
  genZip.file("ppt/slides/_rels/slide2.xml.rels", tplRelsXml);

  // ── Update presentation.xml sldIdLst ─────────────────────────────────────
  const presKey = "ppt/presentation.xml";
  let presXml = await genZip.files[presKey].async("string");

  // Find the highest sldId in use and determine the max id
  const existingIds = [...presXml.matchAll(/id="(\d+)"/g)].map(m => parseInt(m[1]));
  const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 256;
  const newSlideId = maxId + 1;

  // Find the first sld:sld entry (which is now slide2 after shifting) and insert before it
  // We need to insert slide2 as the second entry in the sldIdLst
  // Find the first <p:sldId> entry after the cover slide
  const firstSldIdMatch = presXml.match(/<p:sldId\s[^/]*/);
  if (firstSldIdMatch) {
    const insertAfter = firstSldIdMatch[0] + "/>";
    const newEntry = `<p:sldId id="${newSlideId}" r:id="rId_tpl_slide2"/>`;
    presXml = presXml.replace(insertAfter, insertAfter + newEntry);
  }
  genZip.file(presKey, presXml);

  // ── Update presentation.xml.rels ──────────────────────────────────────────
  const presRelsKey = "ppt/_rels/presentation.xml.rels";
  let presRelsXml = await genZip.files[presRelsKey].async("string");

  // Shift existing rId references for slides (rId2, rId3... → rId3, rId4...)
  // Find the max rId number currently in use
  const rIdNums = [...presRelsXml.matchAll(/Id="rId(\d+)"/g)].map(m => parseInt(m[1]));
  const maxRId = rIdNums.length > 0 ? Math.max(...rIdNums) : 10;

  // Insert new relationship for template slide
  presRelsXml = presRelsXml.replace(
    "</Relationships>",
    `<Relationship Id="rId_tpl_slide2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>`
  );
  genZip.file(presRelsKey, presRelsXml);

  // ── Update [Content_Types].xml ────────────────────────────────────────────
  const ctKey = "[Content_Types].xml";
  let ctXml = await genZip.files[ctKey].async("string");
  if (!ctXml.includes('PartName="/ppt/slides/slide2.xml"')) {
    ctXml = ctXml.replace(
      "</Types>",
      `<Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`
    );
    genZip.file(ctKey, ctXml);
  }

  const finalBuf = await genZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return finalBuf;
}
