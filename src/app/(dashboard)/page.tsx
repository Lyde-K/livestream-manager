import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { formatCurrency, mytMonthYear, mytMonthRange, mytToday } from "@/lib/utils";
import {
  Users, Building2, DoorOpen, Calendar, TrendingUp, Clock,
  CheckCircle2, ArrowUpRight, Medal, Crown,
} from "lucide-react";
import { RangeSelector } from "@/components/ui/range-selector";
import { BrandDashboardPanel } from "@/components/dashboard/brand-dashboard-panel";
import { AllBrandsAnalyticsPanel } from "@/components/dashboard/all-brands-analytics-panel";
import { format } from "date-fns";
import { formatMYT } from "@/lib/myt";

import Link from "next/link";

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchAdminStats(
  start: Date,
  end: Date,
  brandId?: string,
) {
  const sessionWhere = {
    scheduledStart: { gte: start, lte: end },
    ...(brandId ? { brandId } : {}),
  };

  const [monthSessions, totalHosts, totalRooms, totalBrands] = await Promise.all([
    prisma.session.findMany({
      where: sessionWhere,
      include: { brand: true, liveHost: true },
    }),
    prisma.liveHost.count({ where: { isActive: true } }),
    prisma.room.count({ where: { isActive: true } }),
    prisma.brand.count({ where: { isActive: true, hasLivestream: true } }),
  ]);

  const completedSessions = monthSessions.filter(s => s.status === "COMPLETED");
  const monthGMV     = completedSessions.reduce((sum, s) => sum + (s.gmv ?? 0), 0);
  const totalAdsCost = completedSessions.reduce((sum, s) => sum + (s.adsCost ?? 0), 0);

  // Brand GMV breakdown
  const brandMap = new Map<string, { name: string; color: string; gmv: number; adsCost: number; sessions: number; hours: number }>();
  for (const s of completedSessions) {
    const cur = brandMap.get(s.brandId) ?? { name: s.brand.name, color: s.brand.color, gmv: 0, adsCost: 0, sessions: 0, hours: 0 };
    brandMap.set(s.brandId, {
      ...cur,
      gmv:      cur.gmv + (s.gmv ?? 0),
      adsCost:  cur.adsCost + (s.adsCost ?? 0),
      sessions: cur.sessions + 1,
      hours:    cur.hours + (s.actualDurationMinutes ?? 0) / 60,
    });
  }
  const brandBreakdown = [...brandMap.values()]
    .sort((a, b) => b.gmv - a.gmv)
    .map(b => ({ ...b, gmvPerHour: b.hours > 0 ? b.gmv / b.hours : 0, netRevenue: b.gmv - b.adsCost }));
  const topBrands = brandBreakdown.slice(0, 3);

  // Host GMV breakdown
  const hostMap = new Map<string, { name: string; gmv: number; sessions: number; hours: number }>();
  for (const s of completedSessions.filter(s => s.liveHostId)) {
    const key = s.liveHostId!;
    const cur = hostMap.get(key) ?? { name: s.liveHost?.displayName ?? "Unknown", gmv: 0, sessions: 0, hours: 0 };
    hostMap.set(key, {
      ...cur,
      gmv:      cur.gmv + (s.gmv ?? 0),
      sessions: cur.sessions + 1,
      hours:    cur.hours + (s.actualDurationMinutes ?? 0) / 60,
    });
  }
  const topHosts = [...hostMap.values()]
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, 3);

  return {
    totalHosts, totalRooms, totalBrands,
    monthSessionCount: monthSessions.length,
    completedCount: completedSessions.length,
    monthGMV, totalAdsCost, topBrands, topHosts, brandBreakdown,
  };
}

function getAdminStats(start: Date, end: Date, brandId?: string) {
  return fetchAdminStats(start, end, brandId);
}

async function getLiveHostStats(userId: string) {
  const host = await prisma.liveHost.findUnique({ where: { userId } });
  if (!host) return null;
  const { month: mM, year: mY } = mytMonthYear();
  const todayStr = mytToday();
  const { start: monthStart, end: monthEnd } = mytMonthRange(mM, mY);
  const todayStart = new Date(`${todayStr}T00:00:00+08:00`);
  const todayEnd   = new Date(`${todayStr}T23:59:59+08:00`);

  const [todaySessions, monthSessions] = await Promise.all([
    prisma.session.findMany({
      where: { liveHostId: host.id, scheduledStart: { gte: todayStart, lte: todayEnd } },
      include: { room: true, brand: true },
      orderBy: { scheduledStart: "asc" },
    }),
    prisma.session.findMany({
      where: { liveHostId: host.id, scheduledStart: { gte: monthStart, lte: monthEnd } },
      include: { brand: true },
    }),
  ]);

  const completedSessions = monthSessions.filter(s => s.status === "COMPLETED");
  const totalGMV   = completedSessions.reduce((sum, s) => sum + (s.gmv ?? 0), 0);
  const totalHours = completedSessions.reduce((sum, s) => sum + (s.actualDurationMinutes ?? 0) / 60, 0);
  const lateCount  = monthSessions.filter(s => s.punctuality === "LATE").length;

  return { host, todaySessions, monthSessions, completedSessions, totalGMV, totalHours, lateCount };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage(props: {
  searchParams: Promise<{ month?: string; year?: string; brand?: string; start?: string; end?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const user = session.user as { id: string; name: string; role: string };

  if (user.role === "ADMIN") {
    const sp    = await props.searchParams;
    const { month: mM, year: mY } = mytMonthYear();
    const now = new Date(Date.now() + 8 * 3_600_000);

    // Determine date range — custom takes priority over month/year
    let rangeStart: Date;
    let rangeEnd: Date;
    let month: number;
    let year: number;
    let isCustomRange = false;
    let startDate: string | undefined;
    let endDate: string | undefined;

    if (sp.start && sp.end) {
      isCustomRange = true;
      startDate = sp.start;
      endDate   = sp.end;
      rangeStart = new Date(`${sp.start}T00:00:00+08:00`);
      rangeEnd   = new Date(`${sp.end}T23:59:59+08:00`);
      // Derive month/year from start for display fallback (getMonth() is 0-based → +1 for 1-based)
      month = rangeStart.getMonth() + 1;
      year  = rangeStart.getFullYear();
    } else {
      // RangeSelector writes 0-based months to URL → convert to 1-based for mytMonthRange
      month = sp.month !== undefined ? parseInt(sp.month) + 1 : mM;
      year  = sp.year  !== undefined ? parseInt(sp.year)  : mY;
      const { start, end } = mytMonthRange(month, year);
      rangeStart = start;
      rangeEnd   = end;
    }

    const isMTD = !isCustomRange && month === mM && year === mY;
    const selectedBrandId = sp.brand ?? null;

    const [stats, brands] = await Promise.all([
      getAdminStats(rangeStart, rangeEnd, selectedBrandId ?? undefined),
      prisma.brand.findMany({ where: { isActive: true, hasLivestream: true }, orderBy: { name: "asc" } }),
    ]);
    const selectedBrand = selectedBrandId ? brands.find(b => b.id === selectedBrandId) ?? null : null;
    const completionRate = stats.monthSessionCount > 0
      ? Math.round((stats.completedCount / stats.monthSessionCount) * 100)
      : 0;

    const rangeLabel = isCustomRange
      ? `${format(rangeStart, "d MMM yyyy")} – ${format(rangeEnd, "d MMM yyyy")}`
      : format(new Date(year, month - 1, 1), "MMMM yyyy");

    const medals = ["🥇", "🥈", "🥉"];

    return (
      <div className="space-y-6 animate-in">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Livestream Overview</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {format(now, "EEEE, d MMMM yyyy")}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <RangeSelector
              month={month - 1} year={year} isMTD={isMTD}
              brand={selectedBrandId ?? undefined}
              startDate={startDate}
              endDate={endDate}
            />
            <Link
              href="/schedule"
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              <Calendar size={14} /> Schedule
            </Link>
          </div>
        </div>

        {/* Brand tabs */}
        {brands.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            <Link
              href={isCustomRange
                ? `/?start=${startDate}&end=${endDate}`
                : `/?month=${month}&year=${year}`}
              className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
              style={!selectedBrandId
                ? { background: "var(--accent)", color: "#fff" }
                : { background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
              All Brands
            </Link>
            {brands.map(b => (
              <Link key={b.id}
                href={isCustomRange
                  ? `/?start=${startDate}&end=${endDate}&brand=${b.id}`
                  : `/?month=${month}&year=${year}&brand=${b.id}`}
                className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                style={selectedBrandId === b.id
                  ? { background: b.color + "20", color: b.color, border: `1px solid ${b.color}60` }
                  : { background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                {b.name}
              </Link>
            ))}
          </div>
        )}

        {/* Stat cards */}
        {!selectedBrandId && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/admin/hosts">
              <GradientStatCard icon={Users} label="Active Hosts" value={stats.totalHosts} sub="live hosts" gradient="metric-card-orange" />
            </Link>
            <Link href="/admin/rooms">
              <GradientStatCard icon={DoorOpen} label="Studios" value={stats.totalRooms} sub="active rooms" gradient="metric-card-indigo" />
            </Link>
            <Link href="/admin/brands">
              <GradientStatCard icon={Building2} label="Brands" value={stats.totalBrands} sub="active brands" gradient="metric-card-violet" />
            </Link>
            <Link href="/performance">
              <GradientStatCard
                icon={TrendingUp}
                label={isMTD ? "MTD GMV" : "Period GMV"}
                value={formatCurrency(stats.monthGMV)}
                sub={`${stats.completedCount} sessions · ${completionRate}% done`}
                gradient="metric-card-amber"
              />
            </Link>
          </div>
        )}

        {/* Top Brands + Top Hosts + Month Summary row */}
        <div className={`grid grid-cols-1 gap-4 ${selectedBrandId ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>

          {/* Top Brands — hidden when a brand is selected */}
          {!selectedBrandId && (
            <div className="section-card">
              <div className="section-card-header">
                <h2 className="flex items-center gap-1.5 text-sm">
                  <Medal size={13} style={{ color: "var(--warning)" }} />
                  Top Brands
                </h2>
                <Link href="/performance" className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--accent)" }}>
                  <ArrowUpRight size={11} />
                </Link>
              </div>
              {stats.topBrands.length === 0 ? (
                <div className="empty-state py-4 text-xs">No completed sessions yet.</div>
              ) : (
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {stats.topBrands.map((b, i) => (
                    <div key={b.name} className="flex items-center gap-2 px-3 py-2">
                      <span className="text-base w-5 text-center flex-shrink-0 leading-none">{medals[i]}</span>
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: b.color }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-xs truncate" style={{ color: "var(--text-primary)" }}>{b.name}</p>
                        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {b.sessions}sess · {b.hours.toFixed(1)}h
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-xs" style={{ color: "var(--text-primary)" }}>{formatCurrency(b.gmv)}</p>
                        {b.gmvPerHour > 0 && (
                          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                            {formatCurrency(b.gmvPerHour)}/hr
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Top Hosts */}
          {!selectedBrandId && (
            <div className="section-card">
              <div className="section-card-header">
                <h2 className="flex items-center gap-1.5 text-sm">
                  <Crown size={13} style={{ color: "var(--accent)" }} />
                  Top Hosts
                </h2>
                <Link href="/performance" className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--accent)" }}>
                  <ArrowUpRight size={11} />
                </Link>
              </div>
              {stats.topHosts.length === 0 ? (
                <div className="empty-state py-4 text-xs">No completed sessions yet.</div>
              ) : (
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {stats.topHosts.map((h, i) => (
                    <div key={h.name} className="flex items-center gap-2 px-3 py-2">
                      <span className="text-base w-5 text-center flex-shrink-0 leading-none">{medals[i]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-xs truncate" style={{ color: "var(--text-primary)" }}>{h.name}</p>
                        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {h.sessions}sess · {h.hours.toFixed(1)}h
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-xs" style={{ color: "var(--text-primary)" }}>{formatCurrency(h.gmv)}</p>
                        {h.hours > 0 && (
                          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                            {formatCurrency(h.gmv / h.hours)}/hr
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Period Summary */}
          <div className="section-card">
            <div className="section-card-header">
              <h2 className="text-sm">{selectedBrand ? `${selectedBrand.name} · Summary` : "Period Summary"}</h2>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {rangeLabel}{isMTD ? " MTD" : ""}
              </span>
            </div>
            <div className="px-3 py-2 space-y-0">
              <CompactKV label="Sessions" value={`${stats.completedCount} / ${stats.monthSessionCount}`} />
              <CompactKV label="GMV" value={formatCurrency(stats.monthGMV)} highlight />
              <CompactKV label="Ads Cost" value={formatCurrency(stats.totalAdsCost)} />
              <CompactKV label="Net Revenue" value={formatCurrency(stats.monthGMV - stats.totalAdsCost)} highlight />
              <div className="pt-2">
                <div className="flex justify-between text-[10px] mb-1" style={{ color: "var(--text-muted)" }}>
                  <span>Completion</span><span className="font-semibold">{completionRate}%</span>
                </div>
                <div className="progress-track" style={{ height: "4px" }}>
                  <div className="progress-fill" style={{ width: `${completionRate}%`, background: completionRate >= 80 ? "var(--success)" : "var(--warning)" }} />
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Brand-specific dashboard panel OR All-brands analytics */}
        {selectedBrand ? (
          <BrandDashboardPanel
            brandId={selectedBrand.id}
            brandName={selectedBrand.name}
            brandColor={selectedBrand.color}
            month={month}
            year={year}
            currentGMV={stats.monthGMV}
          />
        ) : (
          <AllBrandsAnalyticsPanel month={month} year={year} />
        )}

      </div>
    );
  }

  // ── LIVE HOST view ──────────────────────────────────────────────────────────
  if (user.role === "LIVE_HOST") {
    const stats = await getLiveHostStats(user.id);
    if (!stats) return (
      <div className="p-8 text-center" style={{ color: "var(--text-secondary)" }}>
        No live host profile found. Contact admin.
      </div>
    );
    return (
      <div className="space-y-6 animate-in">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>My Overview</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {format(new Date(Date.now() + 8 * 3_600_000), "EEEE, d MMMM yyyy")}
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <GradientStatCard icon={Calendar}     label="Today"     value={stats.todaySessions.length}        sub="sessions"    gradient="metric-card-orange" />
          <GradientStatCard icon={CheckCircle2} label="Completed" value={stats.completedSessions.length}    sub="this month"  gradient="metric-card-emerald" />
          <GradientStatCard icon={Clock}        label="Hours"     value={`${stats.totalHours.toFixed(1)}h`} sub="this month"  gradient="metric-card-indigo" />
          <GradientStatCard icon={TrendingUp}   label="My GMV"    value={formatCurrency(stats.totalGMV)}    sub="this month"  gradient="metric-card-amber" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="section-card">
            <div className="section-card-header">
              <h2>Today&apos;s Schedule</h2>
              <Link href="/my-schedule" className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--accent)" }}>
                Full schedule <ArrowUpRight size={11} />
              </Link>
            </div>
            <div>
              {stats.todaySessions.length === 0 ? (
                <div className="empty-state">No sessions today</div>
              ) : (
                stats.todaySessions.map(s => (
                  <div key={s.id} className="session-row">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.brand.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{s.brand.name}</div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{s.room?.name ?? "—"} · {s.platform}</div>
                    </div>
                    <div className="text-right text-xs flex-shrink-0" style={{ color: "var(--text-secondary)" }}>
                      <div className="font-medium">{formatMYT(s.scheduledStart, "HH:mm")} – {formatMYT(s.scheduledEnd, "HH:mm")}</div>
                    </div>
                    <StatusPill status={s.status} punctuality={s.punctuality} />
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="section-card">
            <div className="section-card-header"><h2>Punctuality This Month</h2></div>
            <div className="p-5">
              <PunctualityBar sessions={stats.monthSessions} />
              <div className="mt-3 text-sm">
                {stats.lateCount > 5
                  ? <span style={{ color: "var(--danger)" }} className="font-medium">⚠ {stats.lateCount} late sessions — commission deduction applies</span>
                  : <span style={{ color: "var(--success)" }} className="font-medium">✓ On track — {stats.lateCount} late session{stats.lateCount !== 1 ? "s" : ""}</span>
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── CLIENT view ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Welcome, {user.name}</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>{format(new Date(Date.now() + 8 * 3_600_000), "EEEE, d MMMM yyyy")}</p>
      </div>
      <div className="section-card p-10 text-center">
        <Calendar size={40} className="mx-auto mb-3" style={{ color: "var(--accent)" }} />
        <h2 className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Your Brand Schedule</h2>
        <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>View and export your upcoming livestream sessions.</p>
        <Link href="/client-brand" className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium" style={{ background: "var(--accent)", color: "#fff" }}>
          <Calendar size={14} /> View Schedule
        </Link>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CompactKV({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-xs font-semibold" style={{ color: highlight ? "var(--text-primary)" : "var(--text-secondary)" }}>{value}</span>
    </div>
  );
}

function GradientStatCard({ icon: Icon, label, value, sub, gradient }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; gradient: string;
}) {
  return (
    <div className={`${gradient} metric-card-base rounded-xl p-5 relative cursor-pointer`}>
      <div className="absolute right-3 top-3 opacity-[0.12]"><Icon size={44} /></div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[.1em] mb-1" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-xl lg:text-2xl font-bold leading-tight whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{value}</div>
      {sub && <div className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

function StatusPill({ status, punctuality }: { status: string; punctuality?: string | null }) {
  if (status === "PENDING") return <span className="badge badge-secondary">Pending</span>;
  if (status === "MISSED")  return <span className="badge badge-danger">Missed</span>;
  if (punctuality === "LATE")  return <span className="badge badge-warning">Late</span>;
  if (punctuality === "EARLY") return <span className="badge badge-default">Early</span>;
  return <span className="badge badge-success">On Time</span>;
}

function PunctualityBar({ sessions }: { sessions: { punctuality: string | null; status: string }[] }) {
  const done   = sessions.filter(s => s.status === "COMPLETED");
  const early  = done.filter(s => s.punctuality === "EARLY").length;
  const onTime = done.filter(s => s.punctuality === "ON_TIME").length;
  const late   = done.filter(s => s.punctuality === "LATE").length;
  const total  = done.length || 1;
  return (
    <div className="space-y-3">
      {[
        { label: "Early",   count: early,  color: "var(--accent)" },
        { label: "On Time", count: onTime, color: "var(--success)" },
        { label: "Late",    count: late,   color: "var(--warning)" },
      ].map(row => (
        <div key={row.label} className="flex items-center gap-3">
          <div className="w-14 text-xs" style={{ color: "var(--text-muted)" }}>{row.label}</div>
          <div className="flex-1 progress-track">
            <div className="progress-fill" style={{ width: `${(row.count / total) * 100}%`, background: row.color }} />
          </div>
          <div className="w-5 text-xs text-right" style={{ color: "var(--text-secondary)" }}>{row.count}</div>
        </div>
      ))}
    </div>
  );
}
