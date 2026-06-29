import PptxGenJS from "pptxgenjs";
import { readFileSync } from "fs";
import { join } from "path";

const NAVY  = "2A2968";
const WHITE = "FFFFFF";
const LGRAY = "F4F4FB";

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
  return cur >= prev ? "16A34A" : "DC2626";
}

export interface SessionDemographics {
  genderFemale: number;           // 0–100
  ages: [number, number, number, number]; // 18-24, 25-34, 35-44, 45+
  traffic: [number, number, number, number]; // For You, Live Preview, Profile, Shop Tab
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

  bestSession: {
    date: string; hostName: string; gmv: number; hours: number;
    gmvPerHour: number; orders: number; viewers: number; type: string;
  };
  worstSession: {
    date: string; hostName: string; gmv: number; hours: number;
    gmvPerHour: number; adsSpent: number; viewers: number; type: string;
  };

  hosts: { name: string; gmv: number; hours: number; gmvPerHour: number; sessions: number; }[];

  bestDemographics: SessionDemographics;
  worstDemographics: SessionDemographics;
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

export async function generateBrandReport(input: ReportInput): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 10, height: 5.62 });
  pptx.layout = "WIDE";
  pptx.author = "13 Media";
  pptx.company = "13 Media";

  const logo = getLogo();
  const monthLabel  = MONTHS[input.month - 1];
  const prevMonth   = input.month === 1 ? 12 : input.month - 1;
  const prevLabel   = MONTHS[prevMonth - 1];

  // ── Common frame (header + footer + logo) ───────────────────────────────
  function frame(slide: PptxGenJS.Slide, title: string) {
    slide.addText(title, {
      x: 0.16, y: 0.22, w: 9.3, h: 0.6,
      fontSize: 20, bold: true, color: WHITE,
      fill: { color: NAVY }, align: "left", margin: [0,0,0,14],
      fontFace: "Arial",
    });
    slide.addShape("rect" as any, { x:0, y:5.37, w:10, h:0.25, fill:{color:NAVY}, line:{color:NAVY} });
    slide.addImage({ data: logo, x:9.35, y:0.05, w:0.55, h:0.45 });
  }

  // ── SLIDE 1 — COVER ─────────────────────────────────────────────────────
  {
    const s = pptx.addSlide();
    s.addShape("rect" as any, { x:0, y:0, w:10, h:5.62, fill:{color:"0F0E2E"}, line:{color:"0F0E2E"} });
    s.addShape("rect" as any, { x:0, y:5.37, w:10, h:0.25, fill:{color:NAVY}, line:{color:NAVY} });
    s.addShape("rect" as any, { x:0, y:0, w:10, h:0.12, fill:{color:NAVY}, line:{color:NAVY} });

    s.addImage({ data: logo, x:0.5, y:0.28, w:0.85, h:0.72 });

    s.addShape("rect" as any, { x:0.5, y:1.42, w:2.6, h:0.32, fill:{color:"3A3880"}, line:{color:"3A3880"} });
    s.addText(input.platform, { x:0.5, y:1.42, w:2.6, h:0.32, fontSize:11, bold:true, color:WHITE, align:"center", fontFace:"Arial" });

    s.addText("MONTHLY REPORT", { x:0.5, y:1.88, w:9, h:0.6, fontSize:34, bold:true, color:WHITE, align:"left", fontFace:"Arial" });
    s.addText(`${input.platform} LIVESTREAM`, { x:0.5, y:2.44, w:9, h:0.55, fontSize:28, bold:true, color:"A5B4FC", align:"left", fontFace:"Arial" });
    s.addText(input.brandName.toUpperCase(), { x:0.5, y:3.08, w:9, h:0.56, fontSize:22, bold:true, color:WHITE, align:"left", fontFace:"Arial" });
    s.addText(`${monthLabel}  ·  ${input.year}`, { x:0.5, y:3.72, w:9, h:0.42, fontSize:16, color:"94A3B8", align:"left", fontFace:"Arial" });
    s.addText("Digital   |   Social Commerce   |   E-Commerce   |   Marketing", {
      x:0, y:4.88, w:10, h:0.35, fontSize:10, color:"94A3B8", align:"center", fontFace:"Arial",
    });
  }

  // ── SLIDE 2 — LIVESTREAM OVERVIEW (MoM table) ────────────────────────────
  {
    const s = pptx.addSlide();
    frame(s, "LIVESTREAM OVERVIEW");

    const c = input.current, p = input.prev;
    const cGMVph = c.totalHours > 0 ? c.totalGMV / c.totalHours : 0;
    const pGMVph = p.totalHours > 0 ? p.totalGMV / p.totalHours : 0;

    type CellOpts = Parameters<PptxGenJS.Slide["addTable"]>[1] extends { colW?: any } ? any : any;

    const H = { bold:true, color:WHITE, fill:{color:NAVY}, fontSize:9.5, fontFace:"Arial", align:"center" as const, valign:"middle" as const };
    const C = { fontSize:9.5, color:"111111", fontFace:"Arial", align:"center" as const, valign:"middle" as const };
    const L = { ...C, bold:true, align:"left" as const };
    const MOM = (cur: number, prev: number) => ({ ...C, bold:true, color: momColor(cur, prev) });

    const rows: any[][] = [
      [
        { text:"Metric",         options:H },
        { text:prevLabel,        options:H },
        { text:monthLabel,       options:H },
        { text:"MoM (%)",        options:H },
      ],
      [
        { text:"Total GMV",      options:L },
        { text:rm(p.totalGMV),   options:C },
        { text:rm(c.totalGMV),   options:{...C,bold:true} },
        { text:mom(c.totalGMV,p.totalGMV), options:MOM(c.totalGMV,p.totalGMV) },
      ],
      [
        { text:"Total Hours",    options:L },
        { text:p.totalHours.toFixed(1)+"h", options:C },
        { text:c.totalHours.toFixed(1)+"h", options:C },
        { text:mom(c.totalHours,p.totalHours), options:MOM(c.totalHours,p.totalHours) },
      ],
      [
        { text:"GMV / Hour",     options:L },
        { text:rm(pGMVph),       options:C },
        { text:rm(cGMVph),       options:{...C,bold:true} },
        { text:mom(cGMVph,pGMVph), options:MOM(cGMVph,pGMVph) },
      ],
      [
        { text:"Sessions",       options:L },
        { text:String(p.totalSessions), options:C },
        { text:String(c.totalSessions), options:C },
        { text:mom(c.totalSessions,p.totalSessions), options:MOM(c.totalSessions,p.totalSessions) },
      ],
      [
        { text:"BAU GMV",        options:{...L, fill:{color:"EEEEFF"}} },
        { text:rm(p.bauGMV),     options:{...C, fill:{color:"EEEEFF"}} },
        { text:rm(c.bauGMV),     options:{...C, fill:{color:"EEEEFF"}} },
        { text:mom(c.bauGMV,p.bauGMV), options:{...MOM(c.bauGMV,p.bauGMV), fill:{color:"EEEEFF"}} },
      ],
      [
        { text:"BAU Hours",      options:L },
        { text:p.bauHours.toFixed(1)+"h", options:C },
        { text:c.bauHours.toFixed(1)+"h", options:C },
        { text:mom(c.bauHours,p.bauHours), options:MOM(c.bauHours,p.bauHours) },
      ],
      [
        { text:"Campaign GMV",   options:{...L, fill:{color:"EEEEFF"}} },
        { text:rm(p.campGMV),    options:{...C, fill:{color:"EEEEFF"}} },
        { text:rm(c.campGMV),    options:{...C, fill:{color:"EEEEFF"}} },
        { text:mom(c.campGMV,p.campGMV), options:{...MOM(c.campGMV,p.campGMV), fill:{color:"EEEEFF"}} },
      ],
      [
        { text:"Campaign Hours", options:L },
        { text:p.campHours.toFixed(1)+"h", options:C },
        { text:c.campHours.toFixed(1)+"h", options:C },
        { text:mom(c.campHours,p.campHours), options:MOM(c.campHours,p.campHours) },
      ],
    ];

    s.addTable(rows, {
      x:0.25, y:0.95, w:9.5, h:4.3,
      colW:[2.6, 2.1, 2.1, 2.1],
      border:{ type:"solid", color:"D8D8F0", pt:0.5 },
      rowH: 0.44,
    });
  }

  // ── SLIDE 3 — WEEKLY GMV TREND ───────────────────────────────────────────
  {
    const s = pptx.addSlide();
    frame(s, `WEEKLY GMV TREND — ${monthLabel.toUpperCase()} ${input.year}`);

    s.addChart("bar" as any, [{
      name: "GMV",
      labels: input.current.weekLabels,
      values: input.current.weeklyGMV,
    }], {
      x:0.4, y:0.97, w:9.2, h:4.3,
      chartColors: [NAVY],
      barDir: "col",
      showValue: true,
      dataLabelFontSize: 9,
      dataLabelFontBold: true,
      dataLabelColor: NAVY,
      dataLabelPosition: "outEnd",
      valAxisMinVal: 0,
      showLegend: false,
      valAxisMajorGridlines: { style:"dash", color:"E0E0F0" },
      catAxisLabelFontSize: 12,
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

    function card(x: number, y: number, label: string, val: string, bg = LGRAY) {
      s.addShape("rect" as any, { x, y, w:2.1, h:0.82, fill:{color:bg}, line:{color:bg} });
      s.addText(label, { x:x+0.1, y:y+0.06, w:1.9, h:0.2,  fontSize:8,  color:"777777", fontFace:"Arial" });
      s.addText(val,   { x:x+0.1, y:y+0.26, w:1.9, h:0.38, fontSize:15, bold:true, color:NAVY, fontFace:"Arial" });
    }

    s.addText("BAU (Normal Days)",  { x:0.25, y:0.98, w:4.5, h:0.28, fontSize:11, bold:true, color:NAVY, fontFace:"Arial" });
    card(0.25, 1.3,  "GMV",      rm(c.bauGMV));
    card(2.45, 1.3,  "GMV/Hour", rm(bauGMVph));
    card(0.25, 2.2,  "Hours",    c.bauHours.toFixed(1)+"h");
    card(2.45, 2.2,  "Sessions", String(c.bauSessions));

    s.addShape("rect" as any, { x:4.85, y:0.98, w:0.05, h:4.2, fill:{color:"D8D8F0"}, line:{color:"D8D8F0"} });

    s.addText("Campaign Days", { x:5.15, y:0.98, w:4.5, h:0.28, fontSize:11, bold:true, color:NAVY, fontFace:"Arial" });
    card(5.15, 1.3,  "GMV",      rm(c.campGMV), "E8F5E9");
    card(7.35, 1.3,  "GMV/Hour", rm(campGMVph), "E8F5E9");
    card(5.15, 2.2,  "Hours",    c.campHours.toFixed(1)+"h");
    card(7.35, 2.2,  "Sessions", String(c.campSessions));

    // GMV split donut
    s.addText("GMV Contribution", { x:0.25, y:3.18, w:9.4, h:0.25, fontSize:9, bold:true, color:NAVY, fontFace:"Arial", align:"center" });
    s.addChart("doughnut" as any, [{
      name: "GMV Split",
      labels: ["BAU", "Campaign"],
      values: [c.bauGMV || 1, c.campGMV || 0],
    }], {
      x:1.5, y:3.45, w:7, h:1.9,
      chartColors: [NAVY, "4CAF50"],
      holeSize: 55,
      showLegend: true, legendPos:"r", legendFontSize:10,
      showPercent: true, dataLabelFontSize:10, dataLabelFontBold:true,
    } as any);
  }

  // ── SLIDE 5 — BEST PERFORMING SESSION ───────────────────────────────────
  {
    const s = pptx.addSlide();
    frame(s, "BEST PERFORMING SESSION");

    const bs = input.bestSession;
    const bd = input.bestDemographics;

    s.addShape("rect" as any, { x:0.25, y:1.0, w:4.45, h:0.3, fill:{color:"EEFBF0"}, line:{color:"22C55E", pt:1} });
    s.addText(`✓  ${bs.hostName}  ·  ${bs.date}  ·  ${bs.type}`, { x:0.3, y:1.0, w:4.35, h:0.3, fontSize:9, bold:true, color:"16A34A", fontFace:"Arial" });

    function card(x: number, y: number, label: string, val: string, danger = false) {
      s.addShape("rect" as any, { x, y, w:2.1, h:0.75, fill:{color: danger?"FFF0F0":LGRAY}, line:{color: danger?"FECACA":"E8E8F0", pt:0.5} });
      s.addText(val,   { x:x+0.1, y:y+0.07, w:1.9, h:0.38, fontSize:14, bold:true, color: danger?"DC2626":NAVY, fontFace:"Arial" });
      s.addText(label, { x:x+0.1, y:y+0.5,  w:1.9, h:0.2,  fontSize:7.5, color:"777777", fontFace:"Arial" });
    }

    card(0.25, 1.38, "GMV",          rm(bs.gmv));
    card(2.45, 1.38, "GMV / Hour",   rm(bs.gmvPerHour));
    card(0.25, 2.22, "Duration",     bs.hours.toFixed(1)+"h");
    card(2.45, 2.22, "Orders",       bs.orders > 0 ? bs.orders.toLocaleString() : "—");
    card(0.25, 3.06, "Peak Viewers", bs.viewers > 0 ? bs.viewers.toLocaleString() : "—");

    if (input.notes.bestPerformance) {
      s.addShape("rect" as any, { x:0.25, y:3.9, w:4.45, h:1.35, fill:{color:"F8F8FF"}, line:{color:NAVY, pt:1.5} });
      s.addText("PERFORMANCE:", { x:0.35, y:3.98, w:4.2, h:0.22, fontSize:8, bold:true, color:NAVY, fontFace:"Arial" });
      s.addText(input.notes.bestPerformance, { x:0.35, y:4.22, w:4.2, h:0.98, fontSize:8.5, color:"333333", fontFace:"Arial", valign:"top" });
    }

    const RX = 5.05;

    // Gender donut
    s.addText("Gender Split", { x:RX, y:1.0, w:2.3, h:0.25, fontSize:8.5, bold:true, color:NAVY, fontFace:"Arial", align:"center" });
    s.addChart("doughnut" as any, [{
      name:"Gender", labels:["Female","Male"], values:[bd.genderFemale, 100-bd.genderFemale],
    }], { x:RX, y:1.22, w:2.3, h:1.9, chartColors:[NAVY,"A5B4FC"], holeSize:55, showLegend:true, legendPos:"b", legendFontSize:8, showPercent:true, dataLabelFontSize:8 } as any);

    // Age donut
    s.addText("Age Group", { x:RX+2.5, y:1.0, w:2.3, h:0.25, fontSize:8.5, bold:true, color:NAVY, fontFace:"Arial", align:"center" });
    s.addChart("doughnut" as any, [{
      name:"Age", labels:["18–24","25–34","35–44","45+"], values:bd.ages,
    }], { x:RX+2.5, y:1.22, w:2.3, h:1.9, chartColors:["A5B4FC",NAVY,"4F4CB0","7B78D0"], holeSize:55, showLegend:true, legendPos:"b", legendFontSize:8, showPercent:true, dataLabelFontSize:8 } as any);

    // Traffic bar
    s.addText("Traffic Source (%)", { x:RX, y:3.25, w:4.8, h:0.25, fontSize:8.5, bold:true, color:NAVY, fontFace:"Arial", align:"center" });
    s.addChart("bar" as any, [{
      name:"Traffic", labels:["For You Feed","LIVE Preview","Profile","Shop Tab"], values:bd.traffic,
    }], { x:RX, y:3.48, w:4.8, h:1.77, chartColors:[NAVY,"4F4CB0","7B78D0","A5B4FC"], barDir:"bar", showValue:true, dataLabelFontSize:9, showLegend:false, valAxisMinVal:0, valAxisMaxVal:100, catAxisLabelFontSize:8 } as any);
  }

  // ── SLIDE 6 — WEAKEST PERFORMING SESSION ────────────────────────────────
  {
    const s = pptx.addSlide();
    frame(s, "WEAKEST PERFORMING SESSION");

    const ws = input.worstSession;
    const wd = input.worstDemographics;

    s.addShape("rect" as any, { x:0.25, y:1.0, w:4.45, h:0.3, fill:{color:"FFF0F0"}, line:{color:"EF4444", pt:1} });
    s.addText(`⚠  ${ws.hostName}  ·  ${ws.date}  ·  ${ws.type}`, { x:0.3, y:1.0, w:4.35, h:0.3, fontSize:9, bold:true, color:"B91C1C", fontFace:"Arial" });

    function card(x: number, y: number, label: string, val: string, danger = false) {
      s.addShape("rect" as any, { x, y, w:2.1, h:0.75, fill:{color: danger?"FFF0F0":LGRAY}, line:{color: danger?"FECACA":"E8E8F0", pt:0.5} });
      s.addText(val,   { x:x+0.1, y:y+0.07, w:1.9, h:0.38, fontSize:14, bold:true, color: danger?"DC2626":NAVY, fontFace:"Arial" });
      s.addText(label, { x:x+0.1, y:y+0.5,  w:1.9, h:0.2,  fontSize:7.5, color:"777777", fontFace:"Arial" });
    }

    card(0.25, 1.38, "GMV",          rm(ws.gmv),           true);
    card(2.45, 1.38, "GMV / Hour",   rm(ws.gmvPerHour),    true);
    card(0.25, 2.22, "Duration",     ws.hours.toFixed(1)+"h");
    card(2.45, 2.22, "Ads Spent",    ws.adsSpent > 0 ? rm(ws.adsSpent) : "—");
    card(0.25, 3.06, "Peak Viewers", ws.viewers > 0 ? ws.viewers.toLocaleString() : "—");

    if (input.notes.worstImprovement) {
      s.addShape("rect" as any, { x:0.25, y:3.9, w:4.45, h:1.35, fill:{color:"FFF8F8"}, line:{color:"EF4444", pt:1.5} });
      s.addText("IMPROVEMENTS:", { x:0.35, y:3.98, w:4.2, h:0.22, fontSize:8, bold:true, color:"DC2626", fontFace:"Arial" });
      s.addText(input.notes.worstImprovement, { x:0.35, y:4.22, w:4.2, h:0.98, fontSize:8.5, color:"333333", fontFace:"Arial", valign:"top" });
    }

    const RX = 5.05;

    // Gender donut
    s.addText("Gender Split", { x:RX, y:1.0, w:2.3, h:0.25, fontSize:8.5, bold:true, color:NAVY, fontFace:"Arial", align:"center" });
    s.addChart("doughnut" as any, [{
      name:"Gender", labels:["Female","Male"], values:[wd.genderFemale, 100-wd.genderFemale],
    }], { x:RX, y:1.22, w:2.3, h:1.9, chartColors:[NAVY,"A5B4FC"], holeSize:55, showLegend:true, legendPos:"b", legendFontSize:8, showPercent:true, dataLabelFontSize:8 } as any);

    // Revenue vs Ads donut
    const netGMV = Math.max(0, ws.gmv - ws.adsSpent);
    s.addText("Revenue vs Ads", { x:RX+2.5, y:1.0, w:2.3, h:0.25, fontSize:8.5, bold:true, color:NAVY, fontFace:"Arial", align:"center" });
    s.addChart("doughnut" as any, [{
      name:"Revenue", labels:["Net GMV","Ads Cost"], values:[netGMV || ws.gmv, ws.adsSpent || 0.01],
    }], { x:RX+2.5, y:1.22, w:2.3, h:1.9, chartColors:["22C55E","EF4444"], holeSize:55, showLegend:true, legendPos:"b", legendFontSize:8, showPercent:true, dataLabelFontSize:8 } as any);

    // Traffic bar
    s.addText("Traffic Source (%)", { x:RX, y:3.25, w:4.8, h:0.25, fontSize:8.5, bold:true, color:NAVY, fontFace:"Arial", align:"center" });
    s.addChart("bar" as any, [{
      name:"Traffic", labels:["For You Feed","LIVE Preview","Profile","Shop Tab"], values:wd.traffic,
    }], { x:RX, y:3.48, w:4.8, h:1.77, chartColors:[NAVY,"4F4CB0","7B78D0","A5B4FC"], barDir:"bar", showValue:true, dataLabelFontSize:9, showLegend:false, valAxisMinVal:0, valAxisMaxVal:100, catAxisLabelFontSize:8 } as any);
  }

  // ── SLIDE 7 — LIVE HOST OVERVIEW ─────────────────────────────────────────
  {
    const s = pptx.addSlide();
    frame(s, "LIVE HOST OVERVIEW");

    const H = { bold:true, color:WHITE, fill:{color:NAVY}, fontSize:10, fontFace:"Arial", align:"center" as const, valign:"middle" as const };
    const C = { fontSize:10, color:"111111", fontFace:"Arial", align:"center" as const, valign:"middle" as const };

    const rows: any[][] = [
      [
        { text:"Host",      options:{...H, align:"left" as const} },
        { text:"GMV",       options:H },
        { text:"Hours",     options:H },
        { text:"GMV/Hour",  options:H },
        { text:"Sessions",  options:H },
      ],
      ...input.hosts.map((h, i) => {
        const bg = i % 2 === 0 ? WHITE : "F9F9FF";
        return [
          { text:h.name,                          options:{...C, bold:true, align:"left" as const, fill:{color:bg}} },
          { text:rm(h.gmv),                       options:{...C, fill:{color:bg}} },
          { text:h.hours.toFixed(1)+"h",          options:{...C, fill:{color:bg}} },
          { text:rm(h.gmvPerHour),                options:{...C, bold:true, fill:{color:bg}} },
          { text:String(h.sessions),              options:{...C, fill:{color:bg}} },
        ];
      }),
    ];

    const totGMV   = input.hosts.reduce((a,h) => a+h.gmv,   0);
    const totHours = input.hosts.reduce((a,h) => a+h.hours, 0);
    const totSess  = input.hosts.reduce((a,h) => a+h.sessions, 0);
    rows.push([
      { text:"TOTAL",                              options:{...C, bold:true, align:"left" as const, fill:{color:"EEEEFF"}, color:NAVY} },
      { text:rm(totGMV),                           options:{...C, bold:true, fill:{color:"EEEEFF"}, color:NAVY} },
      { text:totHours.toFixed(1)+"h",             options:{...C, bold:true, fill:{color:"EEEEFF"}, color:NAVY} },
      { text:rm(totHours>0 ? totGMV/totHours : 0), options:{...C, bold:true, fill:{color:"EEEEFF"}, color:NAVY} },
      { text:String(totSess),                     options:{...C, bold:true, fill:{color:"EEEEFF"}, color:NAVY} },
    ]);

    const rowH = Math.min(0.48, 4.25 / rows.length);
    s.addTable(rows, {
      x:0.25, y:0.95, w:9.5, h:4.3,
      colW:[3, 2, 1.5, 2, 1],
      border:{ type:"solid", color:"D8D8F0", pt:0.5 },
      rowH,
    });
  }

  // ── SLIDE 8 — SUMMARY ───────────────────────────────────────────────────
  {
    const s = pptx.addSlide();
    frame(s, "SUMMARY");

    const c = input.current, p = input.prev;
    const defaultOverview = [
      `Total GMV (${monthLabel}): ${rm(c.totalGMV)}`,
      `GMV/Hour: ${rm(c.totalHours>0 ? c.totalGMV/c.totalHours : 0)}`,
      `MoM Change: ${mom(c.totalGMV, p.totalGMV)}`,
      `Total Sessions: ${c.totalSessions}`,
      `BAU GMV: ${rm(c.bauGMV)}  |  Campaign GMV: ${rm(c.campGMV)}`,
    ].join("\n");

    s.addShape("rect" as any, { x:0.25, y:1.0, w:4.5, h:4.28, fill:{color:"F8F8FF"}, line:{color:"D8D8F0", pt:0.5} });
    s.addText("OVERVIEW:", { x:0.4, y:1.1, w:4.2, h:0.28, fontSize:10, bold:true, color:NAVY, fontFace:"Arial" });
    s.addText(input.notes.summaryOverview || defaultOverview, {
      x:0.4, y:1.42, w:4.2, h:3.75, fontSize:9.5, color:"333333", fontFace:"Arial", valign:"top", paraSpaceAfter:5,
    });

    s.addShape("rect" as any, { x:5.0, y:1.0, w:4.75, h:4.28, fill:{color:"F8F8FF"}, line:{color:"D8D8F0", pt:0.5} });
    s.addText("NEXT STEPS:", { x:5.15, y:1.1, w:4.45, h:0.28, fontSize:10, bold:true, color:NAVY, fontFace:"Arial" });
    s.addText(input.notes.summaryNextSteps || "—", {
      x:5.15, y:1.42, w:4.45, h:3.75, fontSize:9.5, color:"333333", fontFace:"Arial", valign:"top", paraSpaceAfter:5,
    });
  }

  // ── SLIDE 9 — THANK YOU ──────────────────────────────────────────────────
  {
    const s = pptx.addSlide();
    s.addShape("rect" as any, { x:0, y:0, w:10, h:5.62, fill:{color:"0F0E2E"}, line:{color:"0F0E2E"} });
    s.addShape("rect" as any, { x:0, y:5.37, w:10, h:0.25, fill:{color:NAVY}, line:{color:NAVY} });
    s.addImage({ data:logo, x:9.35, y:0.05, w:0.55, h:0.45 });
    s.addText("THANK YOU", { x:0.5, y:2.05, w:9, h:0.75, fontSize:42, bold:true, color:WHITE, align:"center", fontFace:"Arial" });
    s.addText(`${input.brandName}  ·  ${monthLabel} ${input.year}`, { x:0.5, y:2.9, w:9, h:0.42, fontSize:15, color:"94A3B8", align:"center", fontFace:"Arial" });
    s.addText("Digital   |   Social Commerce   |   E-Commerce   |   Marketing", { x:0, y:4.88, w:10, h:0.35, fontSize:10, color:"94A3B8", align:"center", fontFace:"Arial" });
  }

  const buf = await pptx.write({ outputType: "nodebuffer" });
  return buf as unknown as Buffer;
}
