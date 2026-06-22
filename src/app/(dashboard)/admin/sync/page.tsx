"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, RefreshCw, Link2, Zap, Clock } from "lucide-react";

const TIKTOK_COLS = [
  // ── Manual columns (fill first) ───────────────────────────────────────────
  { col: "A", name: "Brand",    note: "✏️ e.g. Dettol MY" },
  { col: "B", name: "Host",     note: "✏️ Display name e.g. WANI" },
  { col: "C", name: "Hours",    note: "✏️ Hours worked e.g. 2.5" },
  { col: "D", name: "Campaign", note: "✏️ yes / no" },
  { col: "E", name: "Ads Cost", note: "✏️ Manual entry (RM)" },
  // ── Exported columns (paste from TikTok export) ───────────────────────────
  { col: "F",  name: "Livestream",          note: "Paste from TikTok export" },
  { col: "G",  name: "Start time",          note: "Paste from TikTok export" },
  { col: "H",  name: "Duration",            note: "Seconds — paste from export" },
  { col: "I",  name: "Gross revenue",       note: "Paste from TikTok export" },
  { col: "J",  name: "Direct GMV",          note: "Paste from TikTok export" },
  { col: "K",  name: "Items sold",          note: "Paste from TikTok export" },
  { col: "L",  name: "Customers",           note: "Paste from TikTok export" },
  { col: "M",  name: "Avg. price",          note: "Paste from TikTok export" },
  { col: "N",  name: "Orders paid for",     note: "Paste from TikTok export" },
  { col: "O",  name: "GMV/1K shows",        note: "Paste from TikTok export" },
  { col: "P",  name: "GMV/1K views",        note: "Paste from TikTok export (= GPM)" },
  { col: "Q",  name: "Views",               note: "Paste from TikTok export" },
  { col: "R",  name: "Viewers",             note: "Paste from TikTok export" },
  { col: "S",  name: "Peak viewers",        note: "Paste from TikTok export" },
  { col: "T",  name: "New followers",       note: "Paste from TikTok export" },
  { col: "U",  name: "Avg. view duration",  note: "Paste from TikTok export" },
  { col: "V",  name: "Likes",               note: "Paste from TikTok export" },
  { col: "W",  name: "Comments",            note: "Paste from TikTok export" },
  { col: "X",  name: "Shares",              note: "Paste from TikTok export" },
  { col: "Y",  name: "Product impressions", note: "Paste from TikTok export" },
  { col: "Z",  name: "Product clicks",      note: "Paste from TikTok export" },
  { col: "AA", name: "CTR",                 note: "Paste from TikTok export" },
  { col: "AB", name: "CTOR",                note: "Paste from TikTok export" },
];

const SHOPEE_COLS = [
  // ── Manual columns (fill first) ───────────────────────────────────────────
  { col: "A", name: "Brand",    note: "✏️ e.g. Dettol MY" },
  { col: "B", name: "Host",     note: "✏️ Display name e.g. WANI" },
  { col: "C", name: "Hours",    note: "✏️ Hours worked e.g. 2.5" },
  { col: "D", name: "Campaign", note: "✏️ yes / no" },
  // ── Exported columns (paste from Shopee export) ───────────────────────────
  { col: "E",  name: "Livestream Name",           note: "Paste from Shopee export" },
  { col: "F",  name: "Start Time",                note: "Paste from Shopee export" },
  { col: "G",  name: "Duration",                  note: "HH:MM:SS — paste from export" },
  { col: "H",  name: "Engaged Viewers",           note: "Paste from Shopee export" },
  { col: "I",  name: "Comments",                  note: "Paste from Shopee export" },
  { col: "J",  name: "ATC",                       note: "Add-to-cart — paste from export" },
  { col: "K",  name: "Avg. Viewing Duration",     note: "Paste from Shopee export" },
  { col: "L",  name: "Viewers",                   note: "Paste from Shopee export" },
  { col: "M",  name: "Orders(Placed Order)",      note: "Paste from Shopee export" },
  { col: "N",  name: "Orders(Confirmed Order)",   note: "Paste from Shopee export" },
  { col: "O",  name: "Items Sold(Placed Order)",  note: "Paste from Shopee export" },
  { col: "P",  name: "Items Sold(Confirmed Order)", note: "Paste from Shopee export" },
  { col: "Q",  name: "Sales(Placed Order)",       note: "Paste from Shopee export" },
  { col: "R",  name: "Sales(Confirmed Order)",    note: "GMV — paste from export" },
];

const GAS_TEMPLATE = `/**
 * 13 Media · Google Sheets → App Sync (TikTok + Shopee)
 * Paste into Extensions > Apps Script, then save.
 * Run manually via the "13 Media Sync" menu that appears in your sheet toolbar.
 * DO NOT add time-based triggers — run on-demand only.
 *
 * TikTok tab layout  — 28 cols (A–AB):
 *   A:Brand  B:Host  C:Hours  D:Campaign  E:Ads Cost
 *   F:Livestream  G:Start time  H:Duration(sec)  I:Gross revenue
 *   J:Direct GMV  K:Items sold  L:Customers  M:Avg. price
 *   N:Orders paid for  O:GMV/1K shows  P:GMV/1K views(GPM)
 *   Q:Views  R:Viewers  S:Peak viewers  T:New followers
 *   U:Avg. view duration  V:Likes  W:Comments  X:Shares
 *   Y:Product impressions  Z:Product clicks  AA:CTR  AB:CTOR
 *
 * Shopee tab layout  — 18 cols (A–R):
 *   A:Brand  B:Host  C:Hours  D:Campaign
 *   E:Livestream Name  F:Start Time  G:Duration(HH:MM:SS)
 *   H:Engaged Viewers  I:Comments  J:ATC  K:Avg. Viewing Duration
 *   L:Viewers  M:Orders(Placed)  N:Orders(Confirmed)
 *   O:Items Sold(Placed)  P:Items Sold(Confirmed)
 *   Q:Sales(Placed)  R:Sales(Confirmed/GMV)
 */

const APP_URL = "https://your-app-url.vercel.app";  // ← base URL only, no path e.g. https://livestream-manager-beryl.vercel.app
const API_KEY = "PASTE_YOUR_SYNC_KEY_HERE";  // ← paste SHEETS_SYNC_KEY from .env

/** Adds a "13 Media Sync" menu to the sheet toolbar when the spreadsheet opens. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("13 Media Sync")
    .addItem("▶ Sync TikTok + Shopee", "syncAll")
    .addItem("▶ Sync TikTok only",     "syncTikTok")
    .addItem("▶ Sync Shopee only",     "syncShopee")
    .addSeparator()
    .addItem("🔍 Show valid hosts & brands", "loadLookups")
    .addItem("🗑 Delete all auto-triggers",  "deleteAllTriggers")
    .addToUi();
}

/** Removes every time-based trigger from this script (call once to clean up). */
function deleteAllTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    ScriptApp.deleteTrigger(t);
  }
  const msg = triggers.length === 0
    ? "No triggers found — nothing to delete."
    : triggers.length + " trigger(s) deleted. Sync is now manual-only.";
  SpreadsheetApp.getUi().alert(msg);
}

function syncAll() {
  syncTikTok();
  syncShopee();
}

function syncTikTok() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("TikTok");
  if (!sheet) { Logger.log("TikTok sheet not found"); return; }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log("No TikTok data rows."); return; }

  const data = sheet.getRange(2, 1, lastRow - 1, 28).getValues(); // A–AB
  const rows = [];

  for (const r of data) {
    // Manual cols first: A=0 Brand, B=1 Host, C=2 Hours, D=3 Campaign, E=4 Ads Cost
    // Exported cols:     F=5 Livestream, G=6 Start time, H=7 Duration, ...
    const startTime = r[6]; // G: Start time
    if (!startTime) continue;

    // Always send DD-MM-YYYY HH:mm so the server knows the timezone (MYT = +08:00).
    // Using formatDate in the script timezone avoids any silent UTC conversion.
    let startStr = "";
    if (startTime instanceof Date) {
      startStr = Utilities.formatDate(startTime, Session.getScriptTimeZone(), "dd-MM-yyyy HH:mm");
    } else {
      startStr = String(startTime).trim(); // already DD-MM-YYYY HH:mm from platform export
    }

    rows.push({
      platform:           "TIKTOK",
      brand:              String(r[0]  || "").trim(),
      host:               String(r[1]  || "").trim(),
      hours:              toFloat(r[2]),
      campaign:           String(r[3]  || "").trim().toLowerCase() === "yes",
      adsCost:            parseRM(r[4]),
      title:              String(r[5]  || "").trim(),
      startTime:          startStr,
      durationSec:        r[7]  ? Number(r[7])  : null,
      grossRevenue:       parseRM(r[8]),
      gmv:                parseRM(r[9]),
      itemsSold:          toInt(r[10]),
      customers:          toInt(r[11]),
      ordersPaid:         toInt(r[13]),
      gmv1kViews:         toFloat(r[15]),
      views:              toInt(r[16]),
      viewers:            toInt(r[17]),
      peakViewers:        toInt(r[18]),
      newFollowers:       toInt(r[19]),
      avgViewDuration:    String(r[20] || "").trim(),
      likes:              toInt(r[21]),
      comments:           toInt(r[22]),
      shares:             toInt(r[23]),
      productImpressions: toInt(r[24]),
      productClicks:      toInt(r[25]),
      ctr:                toFloat(r[26]),
      ctor:               toFloat(r[27]),
    });
  }

  postRows(rows, "TikTok");
}

function syncShopee() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Shopee");
  if (!sheet) { Logger.log("Shopee sheet not found"); return; }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log("No Shopee data rows."); return; }

  const data = sheet.getRange(2, 1, lastRow - 1, 18).getValues(); // A–R
  const rows = [];

  for (const r of data) {
    // Manual cols first: A=0 Brand, B=1 Host, C=2 Hours, D=3 Campaign
    // Exported cols:     E=4 Livestream Name, F=5 Start Time, G=6 Duration, ...
    const startTime = r[5]; // F: Start Time
    if (!startTime) continue;

    let startStr = "";
    if (startTime instanceof Date) {
      startStr = Utilities.formatDate(startTime, Session.getScriptTimeZone(), "dd-MM-yyyy HH:mm");
    } else {
      startStr = String(startTime).trim(); // already DD-MM-YYYY HH:mm from platform export
    }

    // Duration HH:MM:SS → seconds
    const durStr = String(r[6] || "").trim();
    let durationSec = null;
    if (durStr) {
      const parts = durStr.split(":").map(Number);
      if (parts.length === 3) durationSec = parts[0]*3600 + parts[1]*60 + parts[2];
      else if (parts.length === 2) durationSec = parts[0]*60 + parts[1];
    }

    rows.push({
      platform:        "SHOPEE",
      brand:           String(r[0]  || "").trim(),
      host:            String(r[1]  || "").trim(),
      hours:           toFloat(r[2]),
      campaign:        String(r[3]  || "").trim().toLowerCase() === "yes",
      title:           String(r[4]  || "").trim(),
      startTime:       startStr,
      durationSec:     durationSec,
      engagedViewers:  toInt(r[7]),
      comments:        toInt(r[8]),
      addToCart:       toInt(r[9]),
      avgViewDuration: String(r[10] || "").trim(),
      viewers:         toInt(r[11]),
      ordersPlaced:    toInt(r[12]),
      ordersConfirmed: toInt(r[13]),
      itemsSoldPlaced: toInt(r[14]),
      itemsSold:       toInt(r[15]),
      salesPlaced:     parseRM(r[16]),
      gmv:             parseRM(r[17]),
    });
  }

  postRows(rows, "Shopee");
}

function postRows(rows, label) {
  if (rows.length === 0) { Logger.log("No valid " + label + " rows."); return; }

  const options = {
    method: "post",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    payload: JSON.stringify({ rows }),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(APP_URL + "/api/sync/sheets", options);
  const statusCode = response.getResponseCode();
  const rawText = response.getContentText();

  // Always log raw response so you can see what the API returned if parsing fails
  Logger.log(label + " HTTP " + statusCode + " → " + rawText.substring(0, 500));

  const result = JSON.parse(rawText);
  Logger.log(label + " sync: " + JSON.stringify(result));
  SpreadsheetApp.getUi().alert(
    label + " sync complete! ✅\\n\\n" +
    "Upserted: " + result.upserted + "\\n" +
    "Skipped: "  + result.skipped  + "\\n" +
    (result.errors?.length ? "Errors: " + result.errors.join(", ") : "")
  );
}

// Helpers
function parseRM(val) {
  if (val === null || val === "") return null;
  return Number(String(val).replace(/[^0-9.\\-]/g, "")) || null;
}
function toInt(val) { return val !== "" && val !== null ? parseInt(val) || null : null; }
function toFloat(val) { return val !== "" && val !== null ? parseFloat(val) || null : null; }

/** Fetch valid host/brand names for validation */
function loadLookups() {
  const res = UrlFetchApp.fetch(APP_URL + "/api/sync/sheets", {
    method: "get", headers: { "x-api-key": API_KEY }, muteHttpExceptions: true,
  });
  const data = JSON.parse(res.getContentText());
  Logger.log("Hosts: "  + data.hosts.map(h => h.displayName).join(", "));
  Logger.log("Brands: " + data.brands.map(b => b.name).join(", "));
}
`;

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <Button size="sm" variant="secondary" onClick={copy}>
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "Copied!" : label}
    </Button>
  );
}

function ColTable({ cols, highlight }: { cols: typeof TIKTOK_COLS; highlight?: number[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse w-full">
        <thead>
          <tr>
            {["Col","Header","Note"].map(h => (
              <th key={h} className="px-2 py-1.5 text-left font-semibold"
                style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cols.map((c) => {
            const isManual = c.note.startsWith("✏️");
            return (
              <tr key={c.col} style={isManual ? { background: "rgba(99,102,241,0.06)" } : {}}>
                <td className="px-2 py-1 font-mono font-bold" style={{ border: "1px solid var(--border)", color: "var(--accent)" }}>{c.col}</td>
                <td className="px-2 py-1 font-medium" style={{ border: "1px solid var(--border)", color: "var(--text-primary)" }}>{c.name}</td>
                <td className="px-2 py-1" style={{ border: "1px solid var(--border)", color: isManual ? "var(--accent)" : "var(--text-muted)" }}>{c.note}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function SyncPage() {
  const [tab, setTab] = useState<"tiktok" | "shopee">("tiktok");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sync/status").then(r => r.json()).then(d => setLastSyncAt(d.lastSyncAt));
  }, []);

  async function testConnection() {
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch("/api/sync/sheets", { headers: { "x-api-key": "test-invalid-key" } });
      setTestResult(res.status === 401 ? { ok: true } : { error: "Unexpected status: " + res.status });
    } catch (e) { setTestResult({ error: String(e) }); }
    setTesting(false);
  }

  return (
    <div className="space-y-6 animate-in max-w-4xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Google Sheets Sync</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Your team fills TikTok &amp; Shopee data in Google Sheets — run sync manually from the sheet menu.
          </p>
        </div>
        {lastSyncAt && (
          <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg flex-shrink-0"
            style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
            <Clock size={12} />
            Last synced: <strong style={{ color: "var(--text-secondary)" }}>{formatRelativeTime(lastSyncAt)}</strong>
          </div>
        )}
      </div>

      {/* Step 1 — Create sheet */}
      <div className="section-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: "var(--accent)", color: "#fff" }}>1</span>
          <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Create the Google Sheet</h2>
        </div>

        <div className="ml-8 space-y-3">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Create a Google Sheet with <strong>two tabs</strong>: <code className="px-1 rounded text-xs" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>TikTok</code> and <code className="px-1 rounded text-xs" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>Shopee</code>.
            Row 1 = headers (exactly as below). Row 2+ = data.
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            <span style={{ color: "var(--accent)" }}>Purple rows (A–E for TikTok, A–D for Shopee) = fill these first.</span>{" "}
            Then paste the platform export starting from the next column — no reformatting needed.
          </p>

          {/* Tab selector */}
          <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: "var(--bg-subtle)" }}>
            {(["tiktok","shopee"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className="px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all"
                style={tab === t ? { background: "var(--accent)", color: "#fff" } : { color: "var(--text-secondary)" }}>
                {t === "tiktok" ? "🎵 TikTok" : "🛍️ Shopee"}
              </button>
            ))}
          </div>

          {tab === "tiktok" && (
            <div className="space-y-2">
              <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>TikTok tab — {TIKTOK_COLS.length} columns (A–AB) · 5 manual + 23 exported</p>
              <ColTable cols={TIKTOK_COLS} />
            </div>
          )}
          {tab === "shopee" && (
            <div className="space-y-2">
              <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Shopee tab — {SHOPEE_COLS.length} columns (A–R) · 4 manual + 14 exported</p>
              <ColTable cols={SHOPEE_COLS} />
            </div>
          )}
        </div>
      </div>

      {/* Step 2 — Apps Script */}
      <div className="section-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: "var(--accent)", color: "#fff" }}>2</span>
          <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Paste the Apps Script</h2>
        </div>
        <ol className="text-sm space-y-1 ml-8 list-decimal list-inside" style={{ color: "var(--text-secondary)" }}>
          <li>In your Google Sheet → <strong>Extensions → Apps Script</strong></li>
          <li>Delete existing code, paste the script below</li>
          <li>Replace <code className="px-1 rounded text-xs" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>your-app-url.com</code> with your actual deployed URL</li>
          <li>Replace <code className="px-1 rounded text-xs" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>PASTE_YOUR_SYNC_KEY_HERE</code> with the API key below</li>
          <li>Save → run <code className="px-1 rounded text-xs" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>syncAll()</code> once to test</li>
        </ol>

        <div className="ml-8 p-3 rounded-lg space-y-2" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Your API key (SHEETS_SYNC_KEY)</span>
            <CopyButton text="a51962c35213148edd1448ef078ad4e4c3df5ea762fd1281112e4ab5e7e813f2" label="Copy key" />
          </div>
          <code className="block text-xs font-mono break-all" style={{ color: "var(--text-secondary)" }}>
            a51962c35213148edd1448ef078ad4e4c3df5ea762fd1281112e4ab5e7e813f2
          </code>
        </div>

        <div className="ml-8">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Google Apps Script (TikTok + Shopee)</span>
            <CopyButton text={GAS_TEMPLATE} label="Copy script" />
          </div>
          <pre className="text-xs p-4 rounded-lg overflow-x-auto font-mono leading-relaxed"
            style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-secondary)", maxHeight: 360 }}>
            {GAS_TEMPLATE}
          </pre>
        </div>
      </div>

      {/* Step 3 — Run sync */}
      <div className="section-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: "var(--accent)", color: "#fff" }}>3</span>
          <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Run sync manually</h2>
        </div>
        <div className="ml-8 space-y-3">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            After saving the script, reload your Google Sheet. A <strong>13 Media Sync</strong> menu will appear in the toolbar. Use it to run <strong>Sync TikTok + Shopee</strong>, sync each platform separately, or load valid host/brand names.
          </p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Syncing is safe to run repeatedly — rows are matched by platform + start time + host + brand and never duplicated. <strong>Do not add time-based triggers</strong>; use the menu for on-demand sync only.
          </p>
        </div>
      </div>

      {/* Workflow */}
      <div className="section-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Zap size={14} style={{ color: "var(--warning)" }} />
          <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Daily workflow for your team</h2>
        </div>
        <div className="grid gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          {[
            ["1. Fill manual columns first", "For each session: fill A (Brand), B (Host), C (Hours worked), D (Campaign yes/no). TikTok also needs E (Ads Cost). These go in Row 2 onwards."],
            ["2. Export from TikTok/Shopee", "Go to your platform dashboard → export the livestream report for the date range."],
            ["3. Paste export data after the manual columns", "TikTok: paste starting from Column F. Shopee: paste starting from Column E. The export columns match exactly — no reformatting needed."],
            ["4. Sync from the sheet menu", "Open the sheet, click the \"13 Media Sync\" toolbar menu → \"▶ Sync TikTok + Shopee\". Punctuality is calculated automatically."],
          ].map(([label, desc]) => (
            <div key={label} className="flex gap-2">
              <span className="font-semibold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{label}:</span>
              <span>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Endpoint */}
      <div className="section-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Link2 size={14} style={{ color: "var(--accent)" }} />
          <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Sync Endpoint</h2>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <code className="px-3 py-1.5 rounded-lg text-sm font-mono"
            style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
            POST /api/sync/sheets
          </code>
          <Button size="sm" variant="ghost" onClick={testConnection} loading={testing}>
            <RefreshCw size={13} /> Test endpoint
          </Button>
          {testResult && (
            <span className="text-xs font-medium" style={{ color: testResult.ok ? "var(--success)" : "var(--danger)" }}>
              {testResult.ok ? "✓ Endpoint is live" : testResult.error}
            </span>
          )}
        </div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Auth via <code className="px-1 rounded" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>x-api-key</code> header.
          GET the same endpoint to fetch valid host/brand names for sheet validation (run <code className="px-1 rounded" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>loadLookups()</code> in Apps Script).
        </p>
      </div>
    </div>
  );
}
