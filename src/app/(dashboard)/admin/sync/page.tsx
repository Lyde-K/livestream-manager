"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, RefreshCw, Link2, Zap, ExternalLink } from "lucide-react";

const TIKTOK_COLS = [
  { col: "A", name: "Livestream", note: "Paste from TikTok export" },
  { col: "B", name: "Start time", note: "Paste from TikTok export" },
  { col: "C", name: "Duration", note: "Seconds — paste from export" },
  { col: "D", name: "Gross revenue", note: "Paste from TikTok export" },
  { col: "E", name: "Direct GMV", note: "Paste from TikTok export" },
  { col: "F", name: "Items sold", note: "Paste from TikTok export" },
  { col: "G", name: "Customers", note: "Paste from TikTok export" },
  { col: "H", name: "Avg. price", note: "Paste from TikTok export" },
  { col: "I", name: "Orders paid for", note: "Paste from TikTok export" },
  { col: "J", name: "GMV/1K shows", note: "Paste from TikTok export" },
  { col: "K", name: "GMV/1K views", note: "Paste from TikTok export" },
  { col: "L", name: "Views", note: "Paste from TikTok export" },
  { col: "M", name: "Viewers", note: "Paste from TikTok export" },
  { col: "N", name: "Peak viewers", note: "Paste from TikTok export" },
  { col: "O", name: "New followers", note: "Paste from TikTok export" },
  { col: "P", name: "Avg. view duration", note: "Paste from TikTok export" },
  { col: "Q", name: "Likes", note: "Paste from TikTok export" },
  { col: "R", name: "Comments", note: "Paste from TikTok export" },
  { col: "S", name: "Shares", note: "Paste from TikTok export" },
  { col: "T", name: "Product impressions", note: "Paste from TikTok export" },
  { col: "U", name: "Product clicks", note: "Paste from TikTok export" },
  { col: "V", name: "CTR", note: "Paste from TikTok export" },
  { col: "W", name: "CTOR (SKU orders)", note: "Paste from TikTok export" },
  { col: "X", name: "Ads Cost", note: "✏️ Manual entry (RM)" },
  { col: "Y", name: "Campaign", note: "✏️ yes / no" },
  { col: "Z", name: "Host", note: "✏️ Display name e.g. WANI" },
  { col: "AA", name: "Brand", note: "✏️ e.g. Dettol MY" },
];

const SHOPEE_COLS = [
  { col: "A", name: "Data Period", note: "Paste from Shopee export" },
  { col: "B", name: "User Id", note: "Paste from Shopee export" },
  { col: "C", name: "No.", note: "Paste from Shopee export" },
  { col: "D", name: "Livestream Name", note: "Paste from Shopee export" },
  { col: "E", name: "Start Time", note: "Paste from Shopee export" },
  { col: "F", name: "Duration", note: "Paste from Shopee export" },
  { col: "G", name: "Engaged Viewers", note: "Paste from Shopee export" },
  { col: "H", name: "Comments", note: "Paste from Shopee export" },
  { col: "I", name: "ATC", note: "Add-to-cart — paste from export" },
  { col: "J", name: "Avg. Viewing Duration", note: "Paste from Shopee export" },
  { col: "K", name: "Viewers", note: "Paste from Shopee export" },
  { col: "L", name: "Orders(Placed Order)", note: "Paste from Shopee export" },
  { col: "M", name: "Orders(Confirmed Order)", note: "Paste from Shopee export" },
  { col: "N", name: "Items Sold(Placed Order)", note: "Paste from Shopee export" },
  { col: "O", name: "Items Sold(Confirmed Order)", note: "Paste from Shopee export" },
  { col: "P", name: "Sales(Placed Order)", note: "Paste from Shopee export" },
  { col: "Q", name: "Sales(Confirmed Order)", note: "GMV — paste from export" },
  { col: "R", name: "Campaign", note: "✏️ yes / no" },
  { col: "S", name: "Host", note: "✏️ Display name e.g. WANI" },
  { col: "T", name: "Brand", note: "✏️ e.g. Dettol MY" },
];

const GAS_TEMPLATE = `/**
 * 13 Media · Google Sheets → App Sync (TikTok + Shopee)
 * Paste into Extensions > Apps Script, then run syncAll().
 * Schedule via ⏱ Triggers for auto-sync every 15 minutes.
 */

const APP_URL = "https://your-app-url.com";  // ← replace with your app URL
const API_KEY = "PASTE_YOUR_SYNC_KEY_HERE";  // ← paste SHEETS_SYNC_KEY from .env

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

  const data = sheet.getRange(2, 1, lastRow - 1, 27).getValues(); // A–AA
  const rows = [];

  for (const r of data) {
    const startTime = r[1]; // B: Start time
    if (!startTime) continue;

    let startStr = "";
    if (startTime instanceof Date) {
      startStr = Utilities.formatDate(startTime, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
    } else {
      startStr = String(startTime).trim();
    }

    const durationSec = r[2] ? Number(r[2]) : null;

    rows.push({
      platform: "TIKTOK",
      title:            String(r[0]  || "").trim(),
      startTime:        startStr,
      durationSec:      durationSec,
      grossRevenue:     parseRM(r[3]),
      gmv:              parseRM(r[4]),
      itemsSold:        toInt(r[5]),
      customers:        toInt(r[6]),
      ordersPaid:       toInt(r[8]),
      views:            toInt(r[11]),
      viewers:          toInt(r[12]),
      peakViewers:      toInt(r[13]),
      newFollowers:     toInt(r[14]),
      avgViewDuration:  String(r[15] || "").trim(),
      likes:            toInt(r[16]),
      comments:         toInt(r[17]),
      shares:           toInt(r[18]),
      productImpressions: toInt(r[19]),
      productClicks:    toInt(r[20]),
      ctr:              toFloat(r[21]),
      ctor:             toFloat(r[22]),
      adsCost:          parseRM(r[23]),
      campaign:         String(r[24] || "").trim().toLowerCase() === "yes",
      host:             String(r[25] || "").trim(),
      brand:            String(r[26] || "").trim(),
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

  const data = sheet.getRange(2, 1, lastRow - 1, 20).getValues(); // A–T
  const rows = [];

  for (const r of data) {
    const startTime = r[4]; // E: Start Time
    if (!startTime) continue;

    let startStr = "";
    if (startTime instanceof Date) {
      startStr = Utilities.formatDate(startTime, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
    } else {
      startStr = String(startTime).trim();
    }

    // Duration HH:MM:SS → seconds
    const durStr = String(r[5] || "").trim();
    let durationSec = null;
    if (durStr) {
      const parts = durStr.split(":").map(Number);
      if (parts.length === 3) durationSec = parts[0]*3600 + parts[1]*60 + parts[2];
    }

    rows.push({
      platform:       "SHOPEE",
      title:          String(r[3] || "").trim(),
      startTime:      startStr,
      durationSec:    durationSec,
      engagedViewers: toInt(r[6]),
      comments:       toInt(r[7]),
      addToCart:      toInt(r[8]),
      viewers:        toInt(r[10]),
      ordersPlaced:   toInt(r[11]),
      ordersConfirmed: toInt(r[12]),
      itemsSoldPlaced: toInt(r[13]),
      itemsSold:      toInt(r[14]),
      salesPlaced:    parseRM(r[15]),
      gmv:            parseRM(r[16]),
      campaign:       String(r[17] || "").trim().toLowerCase() === "yes",
      host:           String(r[18] || "").trim(),
      brand:          String(r[19] || "").trim(),
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
  const result = JSON.parse(response.getContentText());

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

export default function SyncPage() {
  const [tab, setTab] = useState<"tiktok" | "shopee">("tiktok");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok?: boolean; error?: string } | null>(null);

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
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Google Sheets Sync</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Your team fills TikTok &amp; Shopee data in Google Sheets — the app syncs automatically every 15 min.
        </p>
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
            🔵 Columns A–W (TikTok) / A–Q (Shopee) = copy-paste directly from platform export, <strong>no editing needed</strong>.
            <span style={{ color: "var(--accent)" }}> Purple rows = manual fill by your team</span> (2–4 extra columns at the end).
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
              <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>TikTok tab — {TIKTOK_COLS.length} columns (A–AA)</p>
              <ColTable cols={TIKTOK_COLS} />
            </div>
          )}
          {tab === "shopee" && (
            <div className="space-y-2">
              <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Shopee tab — {SHOPEE_COLS.length} columns (A–T)</p>
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

      {/* Step 3 — Auto trigger */}
      <div className="section-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: "var(--accent)", color: "#fff" }}>3</span>
          <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Set auto-sync every 15 minutes</h2>
        </div>
        <ol className="text-sm space-y-1 ml-8 list-decimal list-inside" style={{ color: "var(--text-secondary)" }}>
          <li>In Apps Script, click the <strong>⏱ Triggers</strong> (clock) icon in the left panel</li>
          <li>Click <strong>+ Add Trigger</strong></li>
          <li>Function: <strong>syncAll</strong> · Event source: <strong>Time-driven</strong> · Type: <strong>Minutes timer</strong> · Interval: <strong>Every 15 minutes</strong></li>
          <li>Save — Google will ask for permission to run on your behalf</li>
        </ol>
        <p className="text-sm ml-8" style={{ color: "var(--text-muted)" }}>
          Syncing is safe to run repeatedly — rows are matched by platform + start time + host + brand, never duplicated.
        </p>
      </div>

      {/* Workflow */}
      <div className="section-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Zap size={14} style={{ color: "var(--warning)" }} />
          <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Daily workflow for your team</h2>
        </div>
        <div className="grid gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          {[
            ["1. Export from TikTok/Shopee", "Go to your TikTok/Shopee dashboard → export the livestream CSV/XLSX for the date range"],
            ["2. Paste into the sheet", "Open the Google Sheet → select the right tab (TikTok or Shopee) → paste starting from Row 2, Column A. The columns match exactly — no reformatting needed."],
            ["3. Fill the extra columns", "For TikTok: fill X (Ads Cost), Y (Campaign), Z (Host display name), AA (Brand name). For Shopee: fill R (Campaign), S (Host), T (Brand)."],
            ["4. Auto-sync picks it up", "The 15-min trigger syncs new rows automatically. Or click Run → syncAll() for instant sync."],
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
