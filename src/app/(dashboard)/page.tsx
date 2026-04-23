import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import {
  Users, Building2, DoorOpen, Calendar, TrendingUp, Clock,
  CheckCircle2, ArrowUpRight, Medal, RefreshCw, BarChart2,
} from "lucide-react";
import { PlatformBadge } from "@/components/ui/platform-badge";
import { MonthSelector } from "@/components/ui/month-selector";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { unstable_cache } from "next/cache";

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchAdminStats(month: number, year: number) {
  const monthStart = startOfMonth(new Date(year, month, 1));
  const monthEnd   = endOfMonth(new Date(year, month, 1));

  const [monthSessions, totalHosts, totalRooms, totalBrands, recentImports, lastSyncedSession] = await Promise.all([
    prisma.session.findMany({
      where: { scheduledStart: { gte: monthStart, lte: monthEnd } },
      include: { brand: true },
    }),
    prisma.liveHost.count({ where: { isActive: true } }),
    prisma.room.count({ where: { isActive: true } }),
    prisma.brand.count({ where: { isActive: true } }),
    prisma.uploadBatch.findMany({ orderBy: { createdAt: "desc" }, take: 3 }),
    prisma.session.findFirst({
      where: { status: "COMPLETED" },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);

  const completedSessions = monthSessions.filter(s => s.status === "COMPLETED");
  const monthGMV    = completedSessions.reduce((sum, s) => sum + (s.gmv ?? 0), 0);
  const totalAdsCost = completedSessions.reduce((sum, s) => sum + (s.adsCost ?? 0), 0);

  // Brand GMV breakdown (all brands, sorted by GMV)
  const brandMap = new Map<string, { name: string; color: string; gmv: number; adsCost: number; sessions: number; hours: number }>();
  for (const s of completedSessions) {
    const cur = brandMap.get(s.brandId) ?? { name: s.brand.name, color: s.brand.color, gmv: 0, adsCost: 0, sessions: 0, hours: 0 };
    brandMap.set(s.brandId, {
      ...cur,
      gmv: cur.gmv + (s.gmv ?? 0),
      adsCost: cur.adsCost + (s.adsCost ?? 0),
      sessions: cur.sessions + 1,
      hours: cur.hours + (s.actualDurationMinutes ?? 0) / 60,
    });
  }
  const brandBreakdown = [...brandMap.values()]
    .sort((a, b) => b.gmv - a.gmv)
    .map(b => ({ ...b, gmvPerHour: b.hours > 0 ? b.gmv / b.hours : 0, netRevenue: b.gmv - b.adsCost }));
  const topBrands = brandBreakdown.slice(0, 3);

  return {
    totalHosts, totalRooms, totalBrands, recentImports,
    monthSessionCount: monthSessions.length,
    completedCount: completedSessions.length,
    monthGMV, totalAdsCost, topBrands, brandBreakdown,
    lastSyncedAt: lastSyncedSession?.updatedAt ?? null,
  };
}

function getAdminStats(month: number, year: number) {
  return unstable_cache(
    () => fetchAdminStats(month, year),
    ["admin-stats", String(month), String(year)],
    { revalidate: 30 },
  )();
}

async function getLiveHostStats(userId: string) {
  const host = await prisma.liveHost.findUnique({ where: { userId } });
  if (!host) return null;
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd   = endOfMonth(now);
  const todayStart = startOfDay(now);
  const todayEnd   = endOfDay(now);

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
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const user = session.user as { id: string; name: string; role: string };

  if (user.role === "ADMIN") {
    const sp    = await props.searchParams;
    const now   = new Date();
    const month = sp.month !== undefined ? parseInt(sp.month) : now.getMonth();
    const year  = sp.year  !== undefined ? parseInt(sp.year)  : now.getFullYear();
    const isMTD = month === now.getMonth() && year === now.getFullYear();

    const stats = await getAdminStats(month, year);
    const completionRate = stats.monthSessionCount > 0
      ? Math.round((stats.completedCount / stats.monthSessionCount) * 100)
      : 0;

    const displayMonthLabel = format(new Date(year, month, 1), "MMMM yyyy");
    const medals = ["🥇", "🥈", "🥉"];

    return (
      <div className="space-y-6 animate-in">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Dashboard</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {format(now, "EEEE, d MMMM yyyy")}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <MonthSelector month={month} year={year} isMTD={isMTD} />
            <Link
              href="/schedule"
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              <Calendar size={14} /> Schedule
            </Link>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/admin/hosts">
            <GradientStatCard icon={Users} label="Active Hosts" value={stats.totalHosts} sub="live hosts" gradient="metric-card-indigo" />
          </Link>
          <Link href="/admin/rooms">
            <GradientStatCard icon={DoorOpen} label="Studios" value={stats.totalRooms} sub="active rooms" gradient="metric-card-sky" />
          </Link>
          <Link href="/admin/brands">
            <GradientStatCard icon={Building2} label="Brands" value={stats.totalBrands} sub="active brands" gradient="metric-card-violet" />
          </Link>
          <Link href="/performance">
            <GradientStatCard
              icon={TrendingUp}
              label={isMTD ? "MTD GMV" : "Month GMV"}
              value={formatCurrency(stats.monthGMV)}
              sub={`${stats.completedCount} sessions · ${completionRate}% done`}
              gradient="metric-card-emerald"
            />
          </Link>
        </div>

        {/* Top 3 Brands + Month Summary row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Top 3 Brands — compact */}
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

          {/* Month Summary — compact 2-col grid */}
          <div className="section-card">
            <div className="section-card-header">
              <h2 className="text-sm">Month Summary</h2>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{displayMonthLabel}{isMTD ? " MTD" : ""}</span>
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

          {/* Recent Syncs — now shows GSheets sync + file imports */}
          <div className="section-card">
            <div className="section-card-header">
              <h2 className="flex items-center gap-1.5 text-sm">
                <RefreshCw size={12} style={{ color: "var(--accent)" }} />
                Recent Syncs
              </h2>
              <Link href="/admin/sync" className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                Sync now
              </Link>
            </div>
            <div className="px-3 py-2 space-y-2">
              {/* Google Sheet sync */}
              <div className="rounded-lg px-2.5 py-2" style={{ background: "var(--bg-subtle)" }}>
                <p className="text-[10px] font-medium mb-0.5 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Google Sheet Sync</p>
                {stats.lastSyncedAt ? (
                  <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                    {formatDistanceToNow(new Date(stats.lastSyncedAt), { addSuffix: true })}
                  </p>
                ) : (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>No syncs yet</p>
                )}
                {stats.lastSyncedAt && (
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {format(new Date(stats.lastSyncedAt), "d MMM yyyy, HH:mm")}
                  </p>
                )}
              </div>
              {/* File imports */}
              {stats.recentImports.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium mb-1 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>File Imports</p>
                  <div className="space-y-1.5">
                    {stats.recentImports.map(b => (
                      <div key={b.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <PlatformBadge platform={b.platform} showName={false} size="xs" />
                          <span className="truncate max-w-[100px] text-[10px]" style={{ color: "var(--text-secondary)" }}>
                            {b.fileName}
                          </span>
                        </div>
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{b.rowCount}r</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Analytics — Brand breakdown */}
        <div className="section-card">
          <div className="section-card-header">
            <h2 className="flex items-center gap-1.5 text-sm">
              <BarChart2 size={13} style={{ color: "var(--accent)" }} />
              Analytics — {displayMonthLabel}{isMTD ? " (MTD)" : ""}
            </h2>
            <Link href="/performance" className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--accent)" }}>
              Full analytics <ArrowUpRight size={11} />
            </Link>
          </div>
          {stats.brandBreakdown.length === 0 ? (
            <div className="empty-state py-6 text-xs">No completed sessions yet for this period.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table text-xs w-full">
                <thead>
                  <tr>
                    <th className="text-left">Brand</th>
                    <th className="text-right">Sessions</th>
                    <th className="text-right">Hours</th>
                    <th className="text-right">GMV</th>
                    <th className="text-right">GMV/hr</th>
                    <th className="text-right">Ads Cost</th>
                    <th className="text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.brandBreakdown.map((b, i) => (
                    <tr key={b.name}>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">{medals[i] ?? ""}</span>
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: b.color }} />
                          <span className="font-medium" style={{ color: "var(--text-primary)" }}>{b.name}</span>
                        </div>
                      </td>
                      <td className="text-right" style={{ color: "var(--text-secondary)" }}>{b.sessions}</td>
                      <td className="text-right" style={{ color: "var(--text-secondary)" }}>{b.hours.toFixed(1)}h</td>
                      <td className="text-right font-semibold" style={{ color: "var(--text-primary)" }}>{formatCurrency(b.gmv)}</td>
                      <td className="text-right" style={{ color: "var(--text-secondary)" }}>
                        {b.gmvPerHour > 0 ? formatCurrency(b.gmvPerHour) : "—"}
                      </td>
                      <td className="text-right" style={{ color: "var(--text-muted)" }}>
                        {b.adsCost > 0 ? formatCurrency(b.adsCost) : "—"}
                      </td>
                      <td className="text-right" style={{ color: b.netRevenue >= 0 ? "var(--success)" : "var(--danger)" }}>
                        {b.gmv > 0 ? formatCurrency(b.netRevenue) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            Welcome, {user.name} 👋
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {format(new Date(), "EEEE, d MMMM yyyy")}
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <GradientStatCard icon={Calendar}     label="Today"     value={stats.todaySessions.length}        sub="sessions"    gradient="metric-card-indigo" />
          <GradientStatCard icon={CheckCircle2} label="Completed" value={stats.completedSessions.length}    sub="this month"  gradient="metric-card-emerald" />
          <GradientStatCard icon={Clock}        label="Hours"     value={`${stats.totalHours.toFixed(1)}h`} sub="this month"  gradient="metric-card-sky" />
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
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{s.room.name} · {s.platform}</div>
                    </div>
                    <div className="text-right text-xs flex-shrink-0" style={{ color: "var(--text-secondary)" }}>
                      <div className="font-medium">{format(new Date(s.scheduledStart), "HH:mm")} – {format(new Date(s.scheduledEnd), "HH:mm")}</div>
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
        <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>{format(new Date(), "EEEE, d MMMM yyyy")}</p>
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
    <div className={`${gradient} rounded-xl p-5 text-white shadow-md relative overflow-hidden transition-transform hover:scale-[1.02] hover:shadow-lg cursor-pointer`}>
      <div className="absolute right-3 top-3 opacity-20"><Icon size={36} /></div>
      <div className="text-xs font-medium opacity-80 uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-bold mt-1.5 leading-none">{value}</div>
      {sub && <div className="text-xs opacity-70 mt-1.5">{sub}</div>}
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
