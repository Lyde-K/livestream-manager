import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import {
  Users, Building2, DoorOpen, Calendar, TrendingUp, Clock,
  AlertCircle, CheckCircle2, ArrowUpRight, Upload
} from "lucide-react";
import { PlatformBadge } from "@/components/ui/platform-badge";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import Link from "next/link";

async function getAdminStats() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  // Find the month with completed sessions — current month first, then look back up to 6 months
  let displayMonth = now.getMonth(); // 0-indexed
  let displayYear = now.getFullYear();
  let monthSessions: Awaited<ReturnType<typeof prisma.session.findMany>> = [];
  let isFallback = false;

  for (let offset = 0; offset <= 6; offset++) {
    const targetDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const mStart = startOfMonth(targetDate);
    const mEnd = endOfMonth(targetDate);
    const sessions = await prisma.session.findMany({
      where: { scheduledStart: { gte: mStart, lte: mEnd } },
      include: { brand: true },
    });
    const completedInMonth = sessions.filter((s) => s.status === "COMPLETED");
    if (completedInMonth.length > 0 || offset === 0) {
      monthSessions = sessions;
      displayMonth = targetDate.getMonth();
      displayYear = targetDate.getFullYear();
      if (offset > 0) isFallback = true;
      if (completedInMonth.length > 0) break;
    }
  }

  const monthStart = startOfMonth(new Date(displayYear, displayMonth, 1));
  const monthEnd = endOfMonth(new Date(displayYear, displayMonth, 1));

  const [totalHosts, totalRooms, totalBrands, todaySessions, recentImports] =
    await Promise.all([
      prisma.liveHost.count({ where: { isActive: true } }),
      prisma.room.count({ where: { isActive: true } }),
      prisma.brand.count({ where: { isActive: true } }),
      prisma.session.findMany({
        where: { scheduledStart: { gte: todayStart, lte: todayEnd } },
        include: { liveHost: { include: { user: true } }, room: true, brand: true },
        orderBy: { scheduledStart: "asc" },
      }),
      prisma.uploadBatch.findMany({ orderBy: { createdAt: "desc" }, take: 3 }),
    ]);

  // Re-fetch monthSessions with all required fields if needed (already done above)
  const completedSessions = monthSessions.filter((s) => s.status === "COMPLETED");
  const monthGMV = completedSessions.reduce((sum, s) => sum + (s.gmv || 0), 0);
  const totalAdsCost = completedSessions.reduce((sum, s) => sum + (s.adsCost || 0), 0);
  const lateCount = monthSessions.filter((s) => s.punctuality === "LATE").length;

  // Format display month label e.g. "March 2026"
  const displayMonthLabel = format(new Date(displayYear, displayMonth, 1), "MMMM yyyy");

  return {
    totalHosts, totalRooms, totalBrands, todaySessions,
    monthSessionCount: monthSessions.length,
    completedCount: completedSessions.length,
    monthGMV, totalAdsCost, lateCount, recentImports,
    displayMonth, displayYear, displayMonthLabel, isFallback,
    monthStart, monthEnd,
  };
}

async function getLiveHostStats(userId: string) {
  const host = await prisma.liveHost.findUnique({ where: { userId } });
  if (!host) return null;
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

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

  const completedSessions = monthSessions.filter((s) => s.status === "COMPLETED");
  const totalGMV = completedSessions.reduce((sum, s) => sum + (s.gmv || 0), 0);
  const totalHours = completedSessions.reduce((sum, s) => sum + (s.actualDurationMinutes || 0) / 60, 0);
  const lateCount = monthSessions.filter((s) => s.punctuality === "LATE").length;

  return { host, todaySessions, monthSessions, completedSessions, totalGMV, totalHours, lateCount };
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const user = session.user as { id: string; name: string; role: string };

  if (user.role === "ADMIN") {
    const stats = await getAdminStats();
    const completionRate = stats.monthSessionCount > 0
      ? Math.round((stats.completedCount / stats.monthSessionCount) * 100)
      : 0;

    return (
      <div className="space-y-6 animate-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
              Dashboard
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {format(new Date(), "EEEE, d MMMM yyyy")}
            </p>
            {stats.isFallback && (
              <p className="text-xs mt-1 px-2 py-0.5 rounded-full inline-block" style={{ background: "var(--bg-subtle)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                Showing {stats.displayMonthLabel} · No sessions yet this month
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Link
              href="/schedule"
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              <Calendar size={14} /> Schedule
            </Link>
            <Link
              href="/import"
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >
              <Upload size={14} /> Import
            </Link>
          </div>
        </div>

        {/* Stat Cards */}
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
            <GradientStatCard icon={TrendingUp} label="Month GMV" value={formatCurrency(stats.monthGMV)} sub={`${stats.completedCount}/${stats.monthSessionCount} sessions`} gradient="metric-card-emerald" />
          </Link>
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-3 gap-4">
          <MiniStatCard
            label="Completion Rate"
            value={`${completionRate}%`}
            trend={completionRate >= 80 ? "good" : "warn"}
          />
          <MiniStatCard
            label="Late Sessions"
            value={stats.lateCount}
            trend={stats.lateCount > 5 ? "bad" : "good"}
            sub={stats.lateCount > 5 ? "⚠ Deduction risk" : "✓ Within limit"}
          />
          <MiniStatCard
            label="Today's Sessions"
            value={stats.todaySessions.length}
            sub="scheduled"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Today's Sessions — takes 2 cols */}
          <div className="lg:col-span-2 section-card">
            <div className="section-card-header">
              <h2>Today&apos;s Sessions</h2>
              <Link
                href="/schedule"
                className="flex items-center gap-1 text-xs font-medium"
                style={{ color: "var(--accent)" }}
              >
                View all <ArrowUpRight size={11} />
              </Link>
            </div>
            <div>
              {stats.todaySessions.length === 0 ? (
                <div className="empty-state">
                  <Calendar size={28} className="mx-auto mb-2 opacity-30" />
                  No sessions scheduled today
                </div>
              ) : (
                stats.todaySessions.slice(0, 10).map((s) => (
                  <div key={s.id} className="session-row">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: s.brand.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate" style={{ color: "var(--text-primary)" }}>
                        {s.liveHost.user.name}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {s.brand.name} · {s.room.name}
                      </div>
                    </div>
                    <div className="text-right text-xs flex-shrink-0" style={{ color: "var(--text-secondary)" }}>
                      <div className="font-medium">{format(new Date(s.scheduledStart), "HH:mm")}</div>
                      <div style={{ color: "var(--text-muted)" }}>→ {format(new Date(s.scheduledEnd), "HH:mm")}</div>
                    </div>
                    <StatusPill status={s.status} punctuality={s.punctuality} />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Month summary */}
            <div className="section-card">
              <div className="section-card-header">
                <h2>Month Summary</h2>
                {stats.isFallback && (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{stats.displayMonthLabel}</span>
                )}
              </div>
              <div className="p-4 space-y-1">
                <div className="kv-row">
                  <span className="kv-label"><CheckCircle2 size={13} style={{ color: "var(--success)" }} /> Completed</span>
                  <span className="kv-value">{stats.completedCount} / {stats.monthSessionCount}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-label"><AlertCircle size={13} style={{ color: stats.lateCount > 5 ? "var(--danger)" : "var(--warning)" }} /> Late sessions</span>
                  <span className="kv-value" style={{ color: stats.lateCount > 5 ? "var(--danger)" : "var(--text-primary)" }}>{stats.lateCount}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-label"><TrendingUp size={13} style={{ color: "var(--accent)" }} /> Total GMV</span>
                  <span className="kv-value">{formatCurrency(stats.monthGMV)}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-label"><TrendingUp size={13} style={{ color: "var(--text-muted)" }} /> Ads Cost</span>
                  <span className="kv-value">{formatCurrency(stats.totalAdsCost)}</span>
                </div>
                <div className="pt-3">
                  <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
                    <span>Completion</span><span>{completionRate}%</span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${completionRate}%`, background: completionRate >= 80 ? "var(--success)" : "var(--warning)" }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Imports */}
            <div className="section-card">
              <div className="section-card-header">
                <h2>Recent Imports</h2>
                <Link href="/import" className="text-xs font-medium" style={{ color: "var(--accent)" }}>+ Import</Link>
              </div>
              <div className="p-4">
                {stats.recentImports.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    No imports yet.{" "}
                    <Link href="/import" style={{ color: "var(--accent)" }} className="hover:underline">
                      Upload data
                    </Link>
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {stats.recentImports.map((b) => (
                      <div key={b.id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <PlatformBadge platform={b.platform} showName={false} size="xs" />
                          <span className="truncate max-w-[120px] text-xs" style={{ color: "var(--text-secondary)" }}>
                            {b.fileName}
                          </span>
                        </div>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{b.rowCount} rows</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (user.role === "LIVE_HOST") {
    const stats = await getLiveHostStats(user.id);
    if (!stats) {
      return (
        <div className="p-8 text-center" style={{ color: "var(--text-secondary)" }}>
          No live host profile found. Contact admin.
        </div>
      );
    }
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
          <GradientStatCard icon={Calendar} label="Today" value={stats.todaySessions.length} sub="sessions" gradient="metric-card-indigo" />
          <GradientStatCard icon={CheckCircle2} label="Completed" value={stats.completedSessions.length} sub="this month" gradient="metric-card-emerald" />
          <GradientStatCard icon={Clock} label="Hours" value={`${stats.totalHours.toFixed(1)}h`} sub="this month" gradient="metric-card-sky" />
          <GradientStatCard icon={TrendingUp} label="My GMV" value={formatCurrency(stats.totalGMV)} sub="this month" gradient="metric-card-amber" />
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
                stats.todaySessions.map((s) => (
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

  // CLIENT
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
        <Link
          href="/client-brand"
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          <Calendar size={14} /> View Schedule
        </Link>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function GradientStatCard({
  icon: Icon, label, value, sub, gradient,
}: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; gradient: string;
}) {
  return (
    <div className={`${gradient} rounded-xl p-5 text-white shadow-md relative overflow-hidden transition-transform hover:scale-[1.02] hover:shadow-lg cursor-pointer`}>
      <div className="absolute right-3 top-3 opacity-20">
        <Icon size={36} />
      </div>
      <div className="text-xs font-medium opacity-80 uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-bold mt-1.5 leading-none">{value}</div>
      {sub && <div className="text-xs opacity-70 mt-1.5">{sub}</div>}
    </div>
  );
}

function MiniStatCard({ label, value, sub, trend }: { label: string; value: string | number; sub?: string; trend?: "good" | "warn" | "bad" }) {
  const trendColor = trend === "good" ? "var(--success)" : trend === "bad" ? "var(--danger)" : trend === "warn" ? "var(--warning)" : "var(--text-primary)";
  return (
    <div className="section-card p-4">
      <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-xl font-bold" style={{ color: trendColor }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

function StatusPill({ status, punctuality }: { status: string; punctuality?: string | null }) {
  if (status === "PENDING") {
    return <span className="badge badge-secondary">Pending</span>;
  }
  if (status === "MISSED") {
    return <span className="badge badge-danger">Missed</span>;
  }
  if (punctuality === "LATE") return <span className="badge badge-warning">Late</span>;
  if (punctuality === "EARLY") return <span className="badge badge-default">Early</span>;
  return <span className="badge badge-success">On Time</span>;
}

function PunctualityBar({ sessions }: { sessions: { punctuality: string | null; status: string }[] }) {
  const done = sessions.filter((s) => s.status === "COMPLETED");
  const early = done.filter((s) => s.punctuality === "EARLY").length;
  const onTime = done.filter((s) => s.punctuality === "ON_TIME").length;
  const late = done.filter((s) => s.punctuality === "LATE").length;
  const total = done.length || 1;
  return (
    <div className="space-y-3">
      {[
        { label: "Early", count: early, color: "var(--accent)" },
        { label: "On Time", count: onTime, color: "var(--success)" },
        { label: "Late", count: late, color: "var(--warning)" },
      ].map((row) => (
        <div key={row.label} className="flex items-center gap-3">
          <div className="w-14 text-xs" style={{ color: "var(--text-muted)" }}>{row.label}</div>
          <div className="flex-1 progress-track">
            <div
              className="progress-fill"
              style={{ width: `${(row.count / total) * 100}%`, background: row.color }}
            />
          </div>
          <div className="w-5 text-xs text-right" style={{ color: "var(--text-secondary)" }}>{row.count}</div>
        </div>
      ))}
    </div>
  );
}
