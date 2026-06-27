"use client";
import { useState, useEffect, useMemo } from "react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { PlatformBadge, CountryFlag, stripCountry, detectCountry } from "@/components/ui/platform-badge";
import {
  TrendingUp, Clock, AlertCircle, CheckCircle2, Download,
  ChevronDown, ChevronRight, DollarSign, Zap, TrendingDown,
  Eye, ShoppingCart, ChevronLeft, Users, MousePointer2,
} from "lucide-react";
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfQuarter, endOfQuarter, startOfYear, endOfYear,
  subDays, addDays, addWeeks, subWeeks, addMonths, subMonths,
  addQuarters, subQuarters, addYears, subYears, parseISO,
  startOfDay, endOfDay,
} from "date-fns";
import type { HostMonthlyStats } from "@/lib/commission";
import { DatePicker } from "@/components/ui/date-picker";

// ─── Types ───────────────────────────────────────────────────────────────────

type MainTab = "analytics" | "hosts" | "adscost";
type Period = "day" | "week" | "month" | "quarter" | "year" | "last30" | "last90" | "custom";
type Breakdown = "brand" | "host" | "platform" | "country";

interface AnalyticsData {
  totalGMV: number; totalHours: number; totalViewers: number; totalOrders: number;
  avgCTOR: number | null; shopeeConversionRate: number | null; sessionCount: number;
  byDate: { date: string; gmv: number; viewers: number; sessions: number; orders: number }[];
  byBrand: { brandId: string; brandName: string; platform: string; color: string; gmv: number; viewers: number; sessions: number; orders: number; avgCTOR: number | null; conversionRate: number | null }[];
  byHost: { hostId: string; hostName: string; displayName: string; type: string; gmv: number; viewers: number; sessions: number; hours: number }[];
  byPlatform: { platform: string; gmv: number; sessions: number; viewers: number }[];
  byCountry: { country: string; gmv: number; sessions: number; viewers: number }[];
  byType?: { bau: { sessions: number; gmv: number }; campaign: { sessions: number; gmv: number } };
}

type SessionTypeFilter = "ALL" | "BAU" | "CAMPAIGN";

interface ChartBar { label: string; sublabel?: string; value: number; sessions?: number; viewers?: number; date?: string; color?: string; }

// ─── Date range helpers ───────────────────────────────────────────────────────

function getDateRange(period: Period, anchor: Date, cs?: string, ce?: string) {
  const today = mytNow();
  const todayStr = today.toISOString().slice(0, 10);
  switch (period) {
    case "day":    return { start: new Date(`${anchor.toISOString().slice(0,10)}T00:00:00+08:00`), end: new Date(`${anchor.toISOString().slice(0,10)}T23:59:59+08:00`), label: format(anchor, "d MMMM yyyy") };
    case "week": { const s = startOfWeek(anchor,{weekStartsOn:1}), e = endOfWeek(anchor,{weekStartsOn:1}); return { start:new Date(`${format(s,"yyyy-MM-dd")}T00:00:00+08:00`), end:new Date(`${format(e,"yyyy-MM-dd")}T23:59:59+08:00`), label:`${format(s,"d MMM")} – ${format(e,"d MMM yyyy")}` }; }
    case "month":  { const s=startOfMonth(anchor),e=endOfMonth(anchor); return { start:new Date(`${format(s,"yyyy-MM-dd")}T00:00:00+08:00`), end:new Date(`${format(e,"yyyy-MM-dd")}T23:59:59+08:00`), label: format(anchor, "MMMM yyyy") }; }
    case "quarter":{ const s=startOfQuarter(anchor),e=endOfQuarter(anchor),q=Math.floor(anchor.getMonth()/3)+1; return {start:new Date(`${format(s,"yyyy-MM-dd")}T00:00:00+08:00`),end:new Date(`${format(e,"yyyy-MM-dd")}T23:59:59+08:00`),label:`Q${q} ${anchor.getFullYear()}`}; }
    case "year":   { const s=startOfYear(anchor),e=endOfYear(anchor); return { start:new Date(`${format(s,"yyyy-MM-dd")}T00:00:00+08:00`), end:new Date(`${format(e,"yyyy-MM-dd")}T23:59:59+08:00`), label: String(anchor.getFullYear()) }; }
    case "last30": { const s=subDays(today,29); return { start:new Date(`${format(s,"yyyy-MM-dd")}T00:00:00+08:00`), end:new Date(`${todayStr}T23:59:59+08:00`), label: "Last 30 Days" }; }
    case "last90": { const s=subDays(today,89); return { start:new Date(`${format(s,"yyyy-MM-dd")}T00:00:00+08:00`), end:new Date(`${todayStr}T23:59:59+08:00`), label: "Last 90 Days" }; }
    case "custom": if (cs && ce) return {start:new Date(`${cs}T00:00:00+08:00`),end:new Date(`${ce}T23:59:59+08:00`),label:`${format(parseISO(cs),"d MMM")} – ${format(parseISO(ce),"d MMM yyyy")}`};
    // fallthrough
    default: { const s=startOfMonth(anchor),e=endOfMonth(anchor); return { start:new Date(`${format(s,"yyyy-MM-dd")}T00:00:00+08:00`), end:new Date(`${format(e,"yyyy-MM-dd")}T23:59:59+08:00`), label: format(anchor, "MMMM yyyy") }; }
  }
}

function navigateAnchor(period: Period, anchor: Date, dir: 1 | -1): Date {
  switch (period) {
    case "day":     return dir===1 ? addDays(anchor,1)     : subDays(anchor,1);
    case "week":    return dir===1 ? addWeeks(anchor,1)    : subWeeks(anchor,1);
    case "month":   return dir===1 ? addMonths(anchor,1)   : subMonths(anchor,1);
    case "quarter": return dir===1 ? addQuarters(anchor,1) : subQuarters(anchor,1);
    case "year":    return dir===1 ? addYears(anchor,1)    : subYears(anchor,1);
    default: return anchor;
  }
}

function getChartBars(byDate: AnalyticsData["byDate"], period: Period, start: Date, end: Date): ChartBar[] {
  if (period === "week") {
    const bars: ChartBar[] = [];
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      const key = format(d, "yyyy-MM-dd");
      const e = byDate.find(x => x.date === key);
      bars.push({ label: format(d,"EEE"), sublabel: format(d,"d"), value: e?.gmv??0, sessions: e?.sessions??0, viewers: e?.viewers??0, date: key });
    }
    return bars;
  }
  if (period === "month") {
    const wm = new Map<string, ChartBar>();
    for (let d = new Date(start); d <= end; d = addDays(d,1)) {
      const ws = startOfWeek(d,{weekStartsOn:1}); const key = format(ws,"yyyy-MM-dd");
      const e = byDate.find(x => x.date === format(d,"yyyy-MM-dd"));
      const cur = wm.get(key) ?? { label: `${format(ws,"d")}`, sublabel: format(ws,"d MMM"), value:0, sessions:0, viewers:0, date:key };
      wm.set(key, { ...cur, value: cur.value+(e?.gmv??0), sessions: (cur.sessions??0)+(e?.sessions??0), viewers: (cur.viewers??0)+(e?.viewers??0) });
    }
    return Array.from(wm.values());
  }
  if (["quarter","year","last90"].includes(period)) {
    const mm = new Map<string, ChartBar>();
    for (const e of byDate) {
      const mk = e.date.slice(0,7);
      const cur = mm.get(mk) ?? { label: format(parseISO(mk+"-01"),"MMM"), sublabel: format(parseISO(mk+"-01"),"MMM yyyy"), value:0, sessions:0, viewers:0, date:mk };
      mm.set(mk, { ...cur, value: cur.value+e.gmv, sessions: (cur.sessions??0)+e.sessions, viewers: (cur.viewers??0)+e.viewers });
    }
    return Array.from(mm.values());
  }
  if (period === "last30") {
    const wm = new Map<string, ChartBar>();
    for (const e of byDate) {
      const ws = startOfWeek(parseISO(e.date),{weekStartsOn:1}); const key = format(ws,"yyyy-MM-dd");
      const cur = wm.get(key) ?? { label: format(ws,"d MMM"), value:0, sessions:0, viewers:0, date:key };
      wm.set(key, { ...cur, value: cur.value+e.gmv, sessions: (cur.sessions??0)+e.sessions, viewers: (cur.viewers??0)+e.viewers });
    }
    return Array.from(wm.values());
  }
  return byDate.map(e => ({ label: format(parseISO(e.date),"d"), sublabel: format(parseISO(e.date),"d MMM"), value: e.gmv, sessions: e.sessions, viewers: e.viewers, date: e.date }));
}

function shortVal(v: number): string {
  if (v >= 1_000_000) return `${(v/1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v/1_000).toFixed(0)}K`;
  return String(Math.round(v));
}

// ─── Main page ────────────────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const HIGH_ADS_THRESHOLD = 0.5;
const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  {key:"day",label:"Day"},{key:"week",label:"Week"},{key:"month",label:"Month"},
  {key:"quarter",label:"Quarter"},{key:"year",label:"Year"},
  {key:"last30",label:"Last 30"},{key:"last90",label:"Last 90"},{key:"custom",label:"Custom"},
];

function mytNow() { return new Date(Date.now() + 8 * 3_600_000); }

export default function PerformancePage() {
  const now = mytNow();

  // ── Main tab ──────────────────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState<MainTab>("analytics");

  // ── Analytics state ───────────────────────────────────────────────────────
  const [period, setPeriod] = useState<Period>("month");
  const [anchor, setAnchor] = useState(now);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [breakdown, setBreakdown] = useState<Breakdown>("brand");
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [hostTypeFilter, setHostTypeFilter] = useState<"all"|"full"|"part">("all");
  const [sessionType, setSessionType] = useState<SessionTypeFilter>("ALL");

  // ── Host performance state (existing) ────────────────────────────────────
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [hostStats, setHostStats] = useState<HostMonthlyStats[]>([]);
  const [hostLoading, setHostLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [hostTab, setHostTab] = useState<"overview"|"adscost">("overview");

  const { start, end, label } = useMemo(
    () => getDateRange(period, anchor, customStart, customEnd),
    [period, anchor, customStart, customEnd]
  );

  const canNavigate = !["last30","last90","custom"].includes(period);

  // Fetch analytics data
  useEffect(() => {
    if (mainTab !== "analytics") return;
    setAnalyticsLoading(true);
    const s = format(start,"yyyy-MM-dd"), e = format(end,"yyyy-MM-dd");
    const typeParam = sessionType !== "ALL" ? `&type=${sessionType}` : "";
    fetch(`/api/analytics?start=${s}&end=${e}${typeParam}`)
      .then(r => r.json()).then(d => { setAnalyticsData(d); setAnalyticsLoading(false); })
      .catch(() => setAnalyticsLoading(false));
  }, [mainTab, start.toISOString(), end.toISOString(), sessionType]);

  // Fetch host stats
  useEffect(() => {
    if (mainTab !== "hosts" && mainTab !== "adscost") return;
    setHostLoading(true);
    fetch(`/api/performance?month=${month}&year=${year}`)
      .then(r => r.json()).then(d => { setHostStats(Array.isArray(d) ? d : [d]); setHostLoading(false); })
      .catch(() => setHostLoading(false));
  }, [mainTab, month, year]);

  const chartBars = useMemo(() => analyticsData ? getChartBars(analyticsData.byDate, period, start, end) : [], [analyticsData, period, start.toISOString(), end.toISOString()]);

  async function exportExcel() {
    const res = await fetch(`/api/export/performance?month=${month}&year=${year}`);
    if (!res.ok) { alert("Export failed"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`performance-${year}-${String(month).padStart(2,"0")}.xlsx`; a.click(); URL.revokeObjectURL(url);
  }

  // Ads cost sessions (for existing tab)
  const allAdsSessions = hostStats.flatMap(s => s.byBrand.flatMap(b => b.sessions.filter(sess => sess.adsCost != null && sess.adsCost > 0).map(sess => ({ ...sess, hostName:s.hostName, brandName:b.brandName, platform:b.platform, gmvPerHour:(sess.actualDurationMinutes||0)>0?(sess.gmv||0)/((sess.actualDurationMinutes||0)/60):0 })))).sort((a,b)=>(b.adsCostRatio??0)-(a.adsCostRatio??0));
  const highAdsRoiSessions = allAdsSessions.filter(s=>s.adsCostRatio!=null&&s.adsCostRatio>HIGH_ADS_THRESHOLD);

  return (
    <div className="space-y-5 animate-in">
      {/* ── Top header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Performance</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Analytics, host performance and ads cost insights</p>
        </div>
        {(mainTab === "hosts" || mainTab === "adscost") && (
          <div className="flex items-center gap-2">
            <Select value={month} onChange={e=>setMonth(Number(e.target.value))} className="w-28">
              {MONTHS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
            </Select>
            <Select value={year} onChange={e=>setYear(Number(e.target.value))} className="w-24">
              {[2024,2025,2026].map(y=><option key={y} value={y}>{y}</option>)}
            </Select>
            <Button variant="outline" onClick={exportExcel}><Download size={14}/> Export</Button>
          </div>
        )}
      </div>

      {/* ── Main tabs ── */}
      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: "var(--bg-subtle)" }}>
        {([["analytics","Analytics"],["hosts","Host Performance"],["adscost","Sessions Ads Cost"]] as [MainTab,string][]).map(([t,l]) => (
          <button key={t} onClick={()=>setMainTab(t)} className="px-4 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer"
            style={{ background: mainTab===t?"var(--sidebar-active)":"transparent", color: mainTab===t?"#fff":"var(--text-secondary)" }}>
            {l}
            {t==="adscost"&&highAdsRoiSessions.length>0&&<span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full font-bold" style={{background:"var(--danger)",color:"#fff"}}>{highAdsRoiSessions.length}</span>}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ── ANALYTICS TAB ── */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {mainTab === "analytics" && (
        <div className="space-y-5">
          {/* Period picker */}
          <div className="section-card p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background: "var(--bg-subtle)" }}>
                {PERIOD_OPTIONS.map(p => (
                  <button key={p.key} onClick={()=>{ setPeriod(p.key); setAnchor(mytNow()); }}
                    className="px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer"
                    style={{ background: period===p.key?"var(--accent)":"transparent", color: period===p.key?"#fff":"var(--text-secondary)" }}>
                    {p.label}
                  </button>
                ))}
              </div>
              {canNavigate && (
                <div className="flex items-center gap-2">
                  <button onClick={()=>setAnchor(navigateAnchor(period,anchor,-1))} className="p-1 rounded-md cursor-pointer hover:bg-[var(--bg-hover)]"><ChevronLeft size={16} style={{color:"var(--text-secondary)"}}/></button>
                  <span className="text-sm font-semibold min-w-[140px] text-center" style={{color:"var(--text-primary)"}}>{label}</span>
                  <button onClick={()=>setAnchor(navigateAnchor(period,anchor,1))} className="p-1 rounded-md cursor-pointer hover:bg-[var(--bg-hover)]"><ChevronRight size={16} style={{color:"var(--text-secondary)"}}/></button>
                </div>
              )}
              {!canNavigate && period !== "custom" && (
                <span className="text-sm font-semibold" style={{color:"var(--text-primary)"}}>{label}</span>
              )}
              {period === "custom" && (
                <div className="flex items-center gap-2">
                  <DatePicker value={customStart} onChange={setCustomStart} placeholder="Start" className="w-36" />
                  <span style={{color:"var(--text-muted)"}}>–</span>
                  <DatePicker value={customEnd} onChange={setCustomEnd} min={customStart || undefined} placeholder="End" className="w-36" />
                </div>
              )}
              {/* Session type filter */}
              <div className="ml-auto flex gap-0.5 p-0.5 rounded-lg" style={{ background: "var(--bg-subtle)" }}>
                {(["ALL", "BAU", "CAMPAIGN"] as SessionTypeFilter[]).map(t => (
                  <button key={t} onClick={() => setSessionType(t)}
                    className="px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer"
                    style={{ background: sessionType===t?"var(--sidebar-active)":"transparent", color: sessionType===t?"#fff":"var(--text-secondary)" }}>
                    {t === "ALL" ? "All" : t === "BAU" ? "BAU" : "Campaign"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {analyticsLoading ? (
            <div className="text-center py-12" style={{color:"var(--text-muted)"}}>
              <div className="inline-block w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin mb-2"/>
              <div>Loading analytics…</div>
            </div>
          ) : !analyticsData || analyticsData.sessionCount === 0 ? (
            <div className="section-card empty-state">No data for this period</div>
          ) : (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                <AnalKPICard icon={TrendingUp} label="Total GMV" value={formatCurrency(analyticsData.totalGMV)} color="var(--accent)" />
                <AnalKPICard icon={Eye} label="Total Viewers" value={analyticsData.totalViewers.toLocaleString()} color="var(--success)" />
                <AnalKPICard icon={MousePointer2} label="Avg CTOR" value={analyticsData.avgCTOR!=null?`${(analyticsData.avgCTOR*100).toFixed(2)}%`:"—"} color="var(--warning)" sublabel="TikTok" />
                <AnalKPICard icon={MousePointer2} label="Conv. Rate" value={analyticsData.shopeeConversionRate!=null?`${(analyticsData.shopeeConversionRate*100).toFixed(2)}%`:"—"} color="#f97316" sublabel="Shopee" />
                <AnalKPICard icon={ShoppingCart} label="Orders Confirmed" value={analyticsData.totalOrders.toLocaleString()} color="#8b5cf6" />
                <AnalKPICard icon={Clock} label="Total Hours" value={`${analyticsData.totalHours.toFixed(1)}h`} color="#6366f1" />
                <AnalKPICard icon={CheckCircle2} label="Sessions" value={String(analyticsData.sessionCount)} color="var(--text-secondary)" />
              </div>

              {/* BAU / Campaign breakdown — shown when viewing ALL sessions */}
              {sessionType === "ALL" && analyticsData.byType && (analyticsData.byType.bau.sessions > 0 || analyticsData.byType.campaign.sessions > 0) && (
                <div className="flex items-center gap-4 px-4 py-2.5 rounded-lg text-xs" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--text-muted)" }} className="font-medium">Breakdown:</span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    BAU: <strong style={{ color: "var(--text-primary)" }}>{analyticsData.byType.bau.sessions} sessions</strong>
                    {" / "}
                    <strong style={{ color: "var(--text-primary)" }}>{formatCurrency(analyticsData.byType.bau.gmv)} GMV</strong>
                  </span>
                  <span style={{ color: "var(--border)" }}>|</span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    Campaign: <strong style={{ color: "var(--warning)" }}>{analyticsData.byType.campaign.sessions} sessions</strong>
                    {" / "}
                    <strong style={{ color: "var(--warning)" }}>{formatCurrency(analyticsData.byType.campaign.gmv)} GMV</strong>
                  </span>
                </div>
              )}

              {/* Bar chart */}
              {chartBars.length > 0 && (
                <div className="section-card p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold" style={{color:"var(--text-primary)"}}>GMV — {label}</h3>
                    <span className="text-xs" style={{color:"var(--text-muted)"}}>Hover bar for details</span>
                  </div>
                  <BarChart bars={chartBars} />
                </div>
              )}

              {/* Breakdown tabs */}
              <div className="section-card overflow-hidden">
                <div className="px-5 py-3 border-b flex items-center gap-1" style={{borderColor:"var(--border)"}}>
                  {(["brand","host","platform","country"] as Breakdown[]).map(b => (
                    <button key={b} onClick={()=>setBreakdown(b)}
                      className="px-3 py-1 rounded-md text-xs font-medium capitalize transition-all cursor-pointer"
                      style={{ background: breakdown===b?"var(--accent)":"transparent", color: breakdown===b?"#fff":"var(--text-secondary)" }}>
                      {b}
                    </button>
                  ))}
                  {breakdown === "host" && (
                    <div className="ml-auto flex gap-1">
                      {(["all","full","part"] as const).map(t=>(
                        <button key={t} onClick={()=>setHostTypeFilter(t)}
                          className="px-2 py-0.5 rounded text-[11px] font-medium cursor-pointer"
                          style={{ background: hostTypeFilter===t?"var(--bg-card)":"transparent", color:"var(--text-muted)", border: hostTypeFilter===t?"1px solid var(--border)":"1px solid transparent" }}>
                          {t==="all"?"All":t==="full"?"FT Only":"PT Only"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="overflow-x-auto">
                  {breakdown === "brand" && (
                    <table className="data-table">
                      <thead><tr><th>Brand</th><th>Platform</th><th className="text-right">Sessions</th><th className="text-right">GMV</th><th className="text-right">GMV %</th><th className="text-right">Viewers</th><th className="text-right">Conv. Rate</th><th className="text-right">Avg CTOR</th><th className="text-right">Orders</th></tr></thead>
                      <tbody>
                        {analyticsData.byBrand.map(b=>(
                          <tr key={b.brandId}>
                            <td className="font-medium flex items-center gap-1.5"><CountryFlag name={b.brandName}/>{stripCountry(b.brandName)}</td>
                            <td><PlatformBadge platform={b.platform} showName size="xs"/></td>
                            <td className="text-right">{b.sessions}</td>
                            <td className="text-right font-semibold">{formatCurrency(b.gmv)}</td>
                            <td className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{background:"var(--bg-subtle)"}}>
                                  <div className="h-full rounded-full" style={{width:`${Math.min((b.gmv/analyticsData.totalGMV)*100,100)}%`,background:"var(--accent)"}}/>
                                </div>
                                <span className="text-xs tabular-nums">{analyticsData.totalGMV>0?((b.gmv/analyticsData.totalGMV)*100).toFixed(1):0}%</span>
                              </div>
                            </td>
                            <td className="text-right tabular-nums">{b.viewers.toLocaleString()}</td>
                            <td className="text-right tabular-nums">{b.conversionRate!=null?`${(b.conversionRate*100).toFixed(2)}%`:"—"}</td>
                            <td className="text-right tabular-nums">{b.avgCTOR!=null?`${(b.avgCTOR*100).toFixed(2)}%`:"—"}</td>
                            <td className="text-right tabular-nums">{b.orders.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {breakdown === "host" && (
                    <table className="data-table">
                      <thead><tr><th>Host</th><th>Type</th><th className="text-right">Sessions</th><th className="text-right">Hours</th><th className="text-right">GMV</th><th className="text-right">GMV/hr</th><th className="text-right">Viewers</th></tr></thead>
                      <tbody>
                        {analyticsData.byHost
                          .filter(h=>hostTypeFilter==="all"||(hostTypeFilter==="full"&&h.type==="FULL_TIME")||(hostTypeFilter==="part"&&h.type==="PART_TIME"))
                          .map(h=>(
                          <tr key={h.hostId}>
                            <td className="font-medium">{h.hostName} <span className="text-xs ml-1" style={{color:"var(--text-muted)"}}>{h.displayName}</span></td>
                            <td><span className="text-xs px-1.5 py-0.5 rounded-full" style={{background:"var(--bg-subtle)",color:"var(--text-muted)"}}>{h.type==="FULL_TIME"?"FT":"PT"}</span></td>
                            <td className="text-right">{h.sessions}</td>
                            <td className="text-right tabular-nums">{h.hours.toFixed(1)}h</td>
                            <td className="text-right font-semibold">{formatCurrency(h.gmv)}</td>
                            <td className="text-right tabular-nums">{h.hours>0?formatCurrency(h.gmv/h.hours):"—"}</td>
                            <td className="text-right tabular-nums">{h.viewers.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {breakdown === "platform" && (
                    <table className="data-table">
                      <thead><tr><th>Platform</th><th className="text-right">Sessions</th><th className="text-right">GMV</th><th className="text-right">GMV %</th><th className="text-right">Viewers</th></tr></thead>
                      <tbody>
                        {analyticsData.byPlatform.filter(p=>p.sessions>0).map(p=>(
                          <tr key={p.platform}>
                            <td><PlatformBadge platform={p.platform} showName/></td>
                            <td className="text-right">{p.sessions}</td>
                            <td className="text-right font-semibold">{formatCurrency(p.gmv)}</td>
                            <td className="text-right">{analyticsData.totalGMV>0?((p.gmv/analyticsData.totalGMV)*100).toFixed(1):0}%</td>
                            <td className="text-right tabular-nums">{p.viewers.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {breakdown === "country" && (
                    <table className="data-table">
                      <thead><tr><th>Market</th><th className="text-right">Sessions</th><th className="text-right">GMV</th><th className="text-right">GMV %</th><th className="text-right">Viewers</th></tr></thead>
                      <tbody>
                        {analyticsData.byCountry.map(c=>(
                          <tr key={c.country}>
                            <td className="font-medium flex items-center gap-2">
                              {c.country==="MY"&&<span>🇲🇾</span>}{c.country==="SG"&&<span>🇸🇬</span>}
                              {c.country==="MY"?"Malaysia":c.country==="SG"?"Singapore":"Other"}
                            </td>
                            <td className="text-right">{c.sessions}</td>
                            <td className="text-right font-semibold">{formatCurrency(c.gmv)}</td>
                            <td className="text-right">{analyticsData.totalGMV>0?((c.gmv/analyticsData.totalGMV)*100).toFixed(1):0}%</td>
                            <td className="text-right tabular-nums">{c.viewers.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ── HOST PERFORMANCE TAB ── */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {mainTab === "hosts" && (
        <div className="space-y-3">
          {/* host sub-tabs */}
          <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: "var(--bg-subtle)" }}>
            {([["overview","Host Overview"],["adscost","Ads Cost Analysis"]] as const).map(([t,l]) => (
              <button key={t} onClick={()=>setHostTab(t)} className="px-4 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer"
                style={{ background: hostTab===t?"var(--sidebar-active)":"transparent", color: hostTab===t?"#fff":"var(--text-secondary)" }}>
                {l}
                {t==="adscost"&&highAdsRoiSessions.length>0&&<span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full font-bold" style={{background:"var(--danger)",color:"#fff"}}>{highAdsRoiSessions.length}</span>}
              </button>
            ))}
          </div>

          {hostLoading ? (
            <div className="text-center py-12" style={{color:"var(--text-muted)"}}>
              <div className="inline-block w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin mb-2"/><div>Loading…</div>
            </div>
          ) : hostStats.length === 0 ? (
            <div className="section-card empty-state">No performance data for this period</div>
          ) : hostTab === "overview" ? (
            <div className="space-y-3">
              {hostStats.map((s) => (
                <div key={s.hostId} className="section-card">
                  <div className="px-5 py-4 flex items-center gap-4 cursor-pointer transition-colors"
                    onClick={()=>setExpanded(expanded===s.hostId?null:s.hostId)}
                    onMouseEnter={e=>(e.currentTarget.style.background="var(--bg-hover)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0" style={{background:"var(--accent-light)",color:"var(--accent-text)"}}>{s.hostName.charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold" style={{color:"var(--text-primary)"}}>{s.hostName}</div>
                      <div className="text-xs" style={{color:"var(--text-muted)"}}>{s.workingDays}d/week · {MONTHS[s.month-1]} {s.year}</div>
                    </div>
                    <div className="hidden md:flex items-center gap-4 text-xs">
                      <StatPill icon={TrendingUp} label="GMV" value={formatCurrency(s.totalGMV)} colorVar="var(--accent)"/>
                      <StatPill icon={Clock} label="Hours" value={`${s.totalActualHours.toFixed(1)}h`} colorVar={s.hoursDeficit>5?"var(--danger)":"var(--success)"}/>
                      <StatPill icon={AlertCircle} label="Late" value={String(s.lateSessions)} colorVar={s.lateSessions>5?"var(--danger)":"var(--warning)"}/>
                      {s.totalAdsCost>0&&<StatPill icon={DollarSign} label="Ads" value={formatCurrency(s.totalAdsCost)} colorVar="var(--text-muted)"/>}
                      <CommissionChip net={s.netCommission} deductions={s.hoursDeduction+s.punctualityDeduction}/>
                    </div>
                    {expanded===s.hostId?<ChevronDown size={16} style={{color:"var(--text-muted)"}} className="flex-shrink-0"/>:<ChevronRight size={16} style={{color:"var(--text-muted)"}} className="flex-shrink-0"/>}
                  </div>
                  {expanded===s.hostId&&(
                    <div style={{borderTop:"1px solid var(--border)"}} className="px-5 py-4 space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <SummaryCard label="Sessions" value={`${s.totalCompletedSessions}/${s.totalScheduledSessions}`} sub="completed"/>
                        <SummaryCard label="Actual Hours" value={`${s.totalActualHours.toFixed(1)}h`} sub={`req ${s.requiredHours.toFixed(1)}h · deficit ${s.hoursDeficit.toFixed(1)}h`} warn={s.hoursDeficit>5}/>
                        <SummaryCard label="Punctuality" value={`${s.onTimeSessions+s.earlySessions}/${s.totalCompletedSessions}`} sub={`${s.lateSessions} late · ${s.earlySessions} early`} warn={s.lateSessions>5}/>
                        <SummaryCard label="Net Commission" value={formatCurrency(s.netCommission)} sub={s.hoursDeduction+s.punctualityDeduction>0?`-${formatCurrency(s.hoursDeduction+s.punctualityDeduction)} deducted`:"No deductions"}/>
                      </div>
                      {s.hoursDeficit>5&&<div className="alert alert-danger"><AlertCircle size={14} className="flex-shrink-0 mt-0.5"/><span>Hours deficit <strong>{s.hoursDeficit.toFixed(1)}h</strong> &gt; 5h → <strong>-0.5% deduction</strong></span></div>}
                      {s.lateSessions>5&&<div className="alert alert-warning"><AlertCircle size={14} className="flex-shrink-0 mt-0.5"/><span><strong>{s.lateSessions} late sessions</strong> &gt; 5 → <strong>-0.5% deduction</strong></span></div>}
                      <div>
                        <div className="text-sm font-semibold mb-2" style={{color:"var(--text-secondary)"}}>Performance by Brand</div>
                        <div className="overflow-x-auto rounded-lg" style={{border:"1px solid var(--border)"}}>
                          <table className="data-table">
                            <thead><tr><th>Brand</th><th className="text-right">Sessions</th><th className="text-right">Hours</th><th className="text-right">GMV</th><th className="text-right">GMV/hr</th><th className="text-right">Ads Cost</th><th className="text-right">ROI</th><th className="text-right">KPI Tier</th><th className="text-right">Commission</th></tr></thead>
                            <tbody>
                              {s.byBrand.map(b=>{
                                const roiPct=b.totalAdsCost>0&&b.totalGrossRevenue>0?(b.totalAdsCost/b.totalGrossRevenue)*100:null;
                                const roiBad=roiPct!=null&&roiPct>50;
                                return (
                                  <tr key={b.brandId}>
                                    <td className="font-medium">{b.brandName}</td>
                                    <td className="text-right">{b.completedSessions}</td>
                                    <td className="text-right">{b.totalHours.toFixed(1)}h</td>
                                    <td className="text-right">{formatCurrency(b.totalGMV)}</td>
                                    <td className="text-right"><span style={{color:b.normalDayGMVPerHour>=b.tier2KpiNormal&&b.tier2KpiNormal>0?"var(--success)":b.normalDayGMVPerHour>=b.tier1KpiNormal&&b.tier1KpiNormal>0?"var(--warning)":"var(--text-secondary)",fontWeight:600}}>{formatCurrency(b.normalDayGMVPerHour)}</span></td>
                                    <td className="text-right">{b.totalAdsCost>0?formatCurrency(b.totalAdsCost):<span style={{color:"var(--text-muted)"}}>—</span>}</td>
                                    <td className="text-right">{roiPct!=null?<span style={{color:roiBad?"var(--danger)":"var(--success)",fontWeight:600}}>{roiPct.toFixed(1)}%</span>:<span style={{color:"var(--text-muted)"}}>—</span>}</td>
                                    <td className="text-right"><TierBadge tier={b.kpiAchievedTier}/></td>
                                    <td className="text-right font-semibold">{formatCurrency(b.estimatedCommission)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-[11px] mt-1" style={{color:"var(--text-muted)"}}>ROI = Ads Cost ÷ Gross Revenue. Lower is better. Red = &gt;50% spend ratio.</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* Ads cost analysis (existing) */
            <AdsTab allAdsSessions={allAdsSessions} highAdsRoiSessions={highAdsRoiSessions}/>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ── ADS COST TAB (standalone) ── */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {mainTab === "adscost" && (
        hostLoading ? (
          <div className="text-center py-12" style={{color:"var(--text-muted)"}}>
            <div className="inline-block w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin mb-2"/><div>Loading…</div>
          </div>
        ) : <AdsTab allAdsSessions={allAdsSessions} highAdsRoiSessions={highAdsRoiSessions}/>
      )}
    </div>
  );
}

// ─── Bar Chart (SVG) ─────────────────────────────────────────────────────────

function BarChart({ bars }: { bars: ChartBar[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (bars.length === 0) return null;

  const maxVal = Math.max(...bars.map(b => b.value), 1);
  const H = 140, padX = 8;
  const total = bars.length;
  const barW = Math.max(12, Math.min(48, (100 / total) - 2));

  return (
    <div className="relative">
      {hovered !== null && bars[hovered].value > 0 && (
        <div className="absolute top-0 right-0 rounded-lg px-3 py-2 text-xs space-y-0.5 shadow-md z-10"
          style={{background:"var(--bg-card)",border:"1px solid var(--border)",color:"var(--text-primary)"}}>
          <div className="font-semibold">{bars[hovered].sublabel ?? bars[hovered].label}</div>
          <div>GMV: <strong>{formatCurrency(bars[hovered].value)}</strong></div>
          {(bars[hovered].sessions ?? 0) > 0 && <div>Sessions: {bars[hovered].sessions}</div>}
          {(bars[hovered].viewers ?? 0) > 0 && <div>Viewers: {bars[hovered].viewers?.toLocaleString()}</div>}
        </div>
      )}
      <div className="flex items-end gap-1 px-2" style={{height: H + 32}}>
        {bars.map((bar, i) => {
          const pct = (bar.value / maxVal) * 100;
          const isHov = hovered === i;
          return (
            <div key={i} className="flex flex-col items-center flex-1 cursor-default"
              onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)}>
              {/* Value label */}
              <div className="text-[9px] mb-1 font-medium transition-opacity" style={{color:"var(--text-secondary)",opacity: bar.value > 0 ? (isHov ? 1 : 0.7) : 0}}>
                {shortVal(bar.value)}
              </div>
              {/* Bar */}
              <div className="w-full rounded-t-sm transition-all duration-150" style={{
                height: `${Math.max(pct, bar.value > 0 ? 2 : 0)}%`,
                maxHeight: H,
                minHeight: bar.value > 0 ? 4 : 0,
                background: isHov ? "var(--accent)" : "var(--accent-light)",
                opacity: hovered !== null && !isHov ? 0.5 : 1,
              }}/>
              {/* X label */}
              <div className="text-[9px] mt-1 font-medium" style={{color:"var(--text-muted)"}}>{bar.label}</div>
              {bar.sublabel && bar.sublabel !== bar.label && (
                <div className="text-[8px]" style={{color:"var(--text-muted)",opacity:0.7}}>{bar.sublabel}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Ads Cost Analysis tab ────────────────────────────────────────────────────

function AdsTab({ allAdsSessions, highAdsRoiSessions }: { allAdsSessions: ReturnType<typeof Array.prototype.flatMap>; highAdsRoiSessions: typeof allAdsSessions }) {
  return (
    <div className="space-y-4">
      {highAdsRoiSessions.length > 0 && (
        <div className="alert alert-danger"><TrendingDown size={14} className="flex-shrink-0 mt-0.5"/>
          <span><strong>{highAdsRoiSessions.length} session{highAdsRoiSessions.length>1?"s":""}</strong> had ads cost &gt;50% of gross revenue — flagged below.</span>
        </div>
      )}
      {allAdsSessions.length === 0 ? (
        <div className="section-card empty-state">No TikTok ads cost data available for this period.</div>
      ) : (
        <div className="section-card overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center gap-2" style={{borderColor:"var(--border)"}}>
            <Zap size={14} style={{color:"var(--accent)"}}/>
            <span className="text-sm font-semibold" style={{color:"var(--text-primary)"}}>All TikTok Sessions with Ads Cost — sorted by worst ROI</span>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Host</th><th>Brand</th><th>Type</th><th className="text-right">Hours</th><th className="text-right">GMV</th><th className="text-right">Gross Rev</th><th className="text-right">Ads Cost</th><th className="text-right">Spend Ratio</th><th className="text-right">GMV/hr</th></tr></thead>
              <tbody>
                {allAdsSessions.map((s: any) => {
                  const ratioPct=s.adsCostRatio!=null?s.adsCostRatio*100:null;
                  const isRed=ratioPct!=null&&ratioPct>50, isOrange=ratioPct!=null&&ratioPct>30&&!isRed;
                  return (
                    <tr key={s.id} style={isRed?{background:"rgba(239,68,68,0.05)"}:undefined}>
                      <td className="whitespace-nowrap text-sm">{format(new Date(s.scheduledStart),"dd MMM")}</td>
                      <td className="font-medium">{s.hostName}</td>
                      <td>{s.brandName}</td>
                      <td><span className="text-xs" style={{color:s.isCampaignDay?"var(--warning)":"var(--text-muted)"}}>{s.isCampaignDay?"Campaign":"BAU"}</span></td>
                      <td className="text-right tabular-nums">{s.actualDurationMinutes?`${(s.actualDurationMinutes/60).toFixed(1)}h`:"—"}</td>
                      <td className="text-right tabular-nums">{s.gmv!=null?formatCurrency(s.gmv):"—"}</td>
                      <td className="text-right tabular-nums">{s.grossRevenue!=null?formatCurrency(s.grossRevenue):"—"}</td>
                      <td className="text-right tabular-nums">{s.adsCost!=null?formatCurrency(s.adsCost):"—"}</td>
                      <td className="text-right tabular-nums font-semibold">{ratioPct!=null?<span style={{color:isRed?"var(--danger)":isOrange?"var(--warning)":"var(--success)"}}>{ratioPct.toFixed(1)}%</span>:"—"}</td>
                      <td className="text-right tabular-nums">{formatCurrency(s.gmvPerHour)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-2 text-[11px]" style={{color:"var(--text-muted)",borderTop:"1px solid var(--border)"}}>Spend Ratio = Ads Cost ÷ Gross Revenue · Red &gt;50% · Orange &gt;30%</div>
        </div>
      )}
    </div>
  );
}

// ─── Small sub-components ────────────────────────────────────────────────────

function AnalKPICard({ icon: Icon, label, value, color, sublabel }: { icon: React.ElementType; label: string; value: string; color: string; sublabel?: string }) {
  return (
    <div className="section-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} style={{color}} />
        <span className="text-xs" style={{color:"var(--text-muted)"}}>{label}</span>
        {sublabel && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{background:"var(--bg-subtle)",color:"var(--text-muted)",border:"1px solid var(--border)"}}>{sublabel}</span>}
      </div>
      <div className="text-xl font-bold" style={{color:"var(--text-primary)"}}>{value}</div>
    </div>
  );
}

function StatPill({ icon: Icon, label, value, colorVar }: { icon: React.ElementType; label: string; value: string; colorVar: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon size={12} style={{color:colorVar}}/>
      <span style={{color:"var(--text-muted)"}}>{label}:</span>
      <span style={{color:colorVar,fontWeight:600}}>{value}</span>
    </div>
  );
}

function SummaryCard({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-lg p-3" style={{background:warn?"var(--danger-light)":"var(--bg-subtle)",border:warn?"1px solid var(--danger)":"1px solid var(--border)"}}>
      <div className="text-xs mb-0.5" style={{color:"var(--text-muted)"}}>{label}</div>
      <div className="text-lg font-bold" style={{color:warn?"var(--danger-text)":"var(--text-primary)"}}>{value}</div>
      {sub&&<div className="text-xs mt-0.5" style={{color:"var(--text-muted)"}}>{sub}</div>}
    </div>
  );
}

function CommissionChip({ net, deductions }: { net: number; deductions: number }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <CheckCircle2 size={12} style={{color:"var(--success)"}}/>
      <span style={{color:"var(--text-muted)"}}>Est:</span>
      <span style={{color:"var(--success)",fontWeight:600}}>{formatCurrency(net)}</span>
      {deductions>0&&<span style={{color:"var(--danger)"}}>(-{formatCurrency(deductions)})</span>}
    </div>
  );
}

function TierBadge({ tier }: { tier: 0|1|2 }) {
  if (tier===2) return <Badge variant="success">Tier 2 ✓</Badge>;
  if (tier===1) return <Badge variant="warning">Tier 1</Badge>;
  return <Badge variant="secondary">Below KPI</Badge>;
}
