import { prisma } from "@/lib/prisma";
import { getDaysInMonth } from "date-fns";
import { mytMonthRange } from "@/lib/utils";

function countWorkingDays(year: number, month: number, offDowSet: Set<number>, publicHolidayDates: Set<string>): number {
  const days = getDaysInMonth(new Date(year, month - 1, 1));
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay();
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (!offDowSet.has(dow) && !publicHolidayDates.has(dateStr)) {
      count++;
    }
  }
  return count;
}

const ENFAGROW_EXCLUDE_PATTERN = /enfagrow/i;

export interface HostMonthlyStats {
  hostId: string;
  hostName: string;
  displayName: string;
  workingDays: number;
  month: number;
  year: number;
  totalScheduledSessions: number;
  totalCompletedSessions: number;
  missedSessions: number;
  earlySessions: number;
  onTimeSessions: number;
  lateSessions: number;
  totalScheduledHours: number;
  totalActualHours: number;
  requiredHours: number;
  hoursDeficit: number;
  totalGMV: number;
  totalGrossRevenue: number;
  totalAdsCost: number;
  byBrand: BrandStats[];
  // Commission
  estimatedCommission: number;
  hoursDeduction: number;
  punctualityDeduction: number;
  netCommission: number;
}

export interface BrandStats {
  brandId: string;
  brandName: string;
  platform: string;
  completedSessions: number;
  totalHours: number;
  totalGMV: number;
  totalGrossRevenue: number;
  totalAdsCost: number;
  adsCostRatio: number;
  gmvPerHour: number;
  normalDayGMVPerHour: number;
  campaignDayGMVPerHour: number;
  tier1KpiNormal: number;
  tier2KpiNormal: number;
  tier1KpiCampaign: number;
  tier2KpiCampaign: number;
  kpiAchievedTier: 0 | 1 | 2;   // based on BAU tier for display
  estimatedCommission: number;
  bauCommission: number;
  campCommission: number;
  // KPI config snapshot (null = no config saved for this month)
  kpiConfigFound: boolean;
  kpi1Rate: number;
  kpi2Rate: number;
  bauTier: 0 | 1 | 2;
  campTier: 0 | 1 | 2;
  // Session-level detail for ads cost analysis
  sessions: SessionDetail[];
}

export interface SessionDetail {
  id: string;
  scheduledStart: Date;
  actualDurationMinutes: number | null;
  gmv: number | null;
  grossRevenue: number | null;
  adsCost: number | null;
  adsCostRatio: number | null;
  punctuality: string | null;
  isCampaignDay: boolean;
}

export async function getHostMonthlyStats(
  hostId: string,
  month: number,
  year: number
): Promise<HostMonthlyStats | null> {
  const host = await prisma.liveHost.findUnique({
    where: { id: hostId },
    include: { user: true },
  });
  if (!host) return null;

  const { start: monthStart, end: monthEnd } = mytMonthRange(month, year);

  const sessions = await prisma.session.findMany({
    where: { liveHostId: hostId, scheduledStart: { gte: monthStart, lte: monthEnd } },
    include: { brand: true },
  });

  const [rule, preferences, publicHolidays, kpiConfigs] = await Promise.all([
    prisma.commissionRule.findFirst({ where: { isDefault: true } }),
    prisma.hostPreference.findUnique({ where: { liveHostId: hostId } }),
    prisma.publicHoliday.findMany({ where: { year, month } }),
    prisma.brandKPIConfig.findMany({ where: { month, year } }),
  ]);

  const lateThreshold = rule?.lateSessionsThreshold ?? 5;
  const hoursDeficitThreshold = rule?.hoursDeficitThreshold ?? 5;

  const completed = sessions.filter((s) => s.status === "COMPLETED");
  const missed = sessions.filter((s) => s.status === "MISSED");
  const late = completed.filter((s) => s.punctuality === "LATE");
  const early = completed.filter((s) => s.punctuality === "EARLY");
  const onTime = completed.filter((s) => s.punctuality === "ON_TIME");

  const totalActualHours = completed.reduce((sum, s) => sum + (s.actualDurationMinutes || 0) / 60, 0);
  const totalScheduledHours = sessions.reduce((sum, s) => {
    const diff = (new Date(s.scheduledEnd).getTime() - new Date(s.scheduledStart).getTime()) / 3600000;
    return sum + diff;
  }, 0);

  // Required hours: 6h × actual working days (excluding host off-days and public holidays)
  const rawOffDays: unknown = preferences ? JSON.parse(preferences.offDays) : [];
  const offDowSet = new Set<number>(
    Array.isArray(rawOffDays) ? (rawOffDays as number[]).filter((x) => typeof x === "number") : []
  );
  const publicHolidayDates = new Set<string>(publicHolidays.map((h) => h.date));
  const workingDaysCount = countWorkingDays(year, month, offDowSet, publicHolidayDates);
  const requiredHours = workingDaysCount * 6;
  const hoursDeficit = Math.max(0, requiredHours - totalActualHours);

  // Group sessions by brand
  const brandMap = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const arr = brandMap.get(s.brandId) || [];
    arr.push(s);
    brandMap.set(s.brandId, arr);
  }

  const kpiConfigMap = new Map(kpiConfigs.map((k) => [k.brandId, k]));

  const byBrand: BrandStats[] = [];
  let estimatedCommissionTotal = 0;
  let deductionBaseGMV = 0; // GMV excluding Enfagrow brands

  for (const [brandId, brandSessions] of brandMap) {
    const comp = brandSessions.filter((s) => s.status === "COMPLETED");
    const brandName = brandSessions[0].brand.name;

    const totalHours = comp.reduce((sum, s) => sum + (s.actualDurationMinutes || 0) / 60, 0);
    const totalGMV = comp.reduce((sum, s) => sum + (s.gmv || 0), 0);
    const totalGrossRevenue = comp.reduce((sum, s) => sum + ((s as any).grossRevenue || 0), 0);
    const totalAdsCost = comp.reduce((sum, s) => sum + ((s as any).adsCost || 0), 0);
    const adsCostRatio = totalGrossRevenue > 0 ? totalAdsCost / totalGrossRevenue : 0;
    const gmvPerHour = totalHours > 0 ? totalGMV / totalHours : 0;

    const normalSessions = comp.filter((s) => !s.isCampaignDay);
    const campaignSessions = comp.filter((s) => s.isCampaignDay);
    const normalHours = normalSessions.reduce((sum, s) => sum + (s.actualDurationMinutes || 0) / 60, 0);
    const normalGMV = normalSessions.reduce((sum, s) => sum + (s.gmv || 0), 0);
    const campaignHours = campaignSessions.reduce((sum, s) => sum + (s.actualDurationMinutes || 0) / 60, 0);
    const campaignGMV = campaignSessions.reduce((sum, s) => sum + (s.gmv || 0), 0);
    const normalGMVPerHour = normalHours > 0 ? normalGMV / normalHours : 0;
    const campaignGMVPerHour = campaignHours > 0 ? campaignGMV / campaignHours : 0;

    const sessionDetails: SessionDetail[] = comp.map((s) => {
      const gr = (s as any).grossRevenue as number | null;
      const ac = (s as any).adsCost as number | null;
      return {
        id: s.id,
        scheduledStart: s.scheduledStart,
        actualDurationMinutes: s.actualDurationMinutes,
        gmv: s.gmv,
        grossRevenue: gr,
        adsCost: ac,
        adsCostRatio: gr && gr > 0 && ac != null ? ac / gr : null,
        punctuality: s.punctuality,
        isCampaignDay: s.isCampaignDay,
      };
    });

    const kpi = kpiConfigMap.get(brandId);
    let kpiAchievedTier: 0 | 1 | 2 = 0;
    let bauCommission = 0;
    let campCommission = 0;
    let resolvedBauTier: 0 | 1 | 2 = 0;
    let resolvedCampTier: 0 | 1 | 2 = 0;
    const kpi1Rate = kpi?.kpi1Rate ?? 0;
    const kpi2Rate = kpi?.kpi2Rate ?? 0;

    if (kpi) {
      const kpi1 = kpi1Rate;
      const kpi2 = kpi2Rate;

      // ── BAU commission ────────────────────────────────────────────────
      if (kpi.bauTier1 > 0) {
        if (kpi.bauTier2 > 0 && normalGMVPerHour >= kpi.bauTier2) {
          resolvedBauTier = 2;
          kpiAchievedTier = 2;
        } else if (normalGMVPerHour >= kpi.bauTier1) {
          resolvedBauTier = 1;
          if (kpiAchievedTier < 1) kpiAchievedTier = 1;
        }
        const bauRate = resolvedBauTier === 2 ? kpi1 + kpi2 : resolvedBauTier === 1 ? kpi1 : 0;
        bauCommission = normalGMV * (bauRate / 100);
      }

      // ── Campaign commission ────────────────────────────────────────────
      if (kpi.campTier1 > 0 && campaignGMV > 0) {
        if (kpi.campTier2 > 0 && campaignGMVPerHour >= kpi.campTier2) {
          resolvedCampTier = 2;
        } else if (campaignGMVPerHour >= kpi.campTier1) {
          resolvedCampTier = 1;
        }
        const campRate = resolvedCampTier === 2 ? kpi1 + kpi2 : resolvedCampTier === 1 ? kpi1 : 0;
        campCommission = campaignGMV * (campRate / 100);
      }
    }

    const brandCommission = bauCommission + campCommission;
    estimatedCommissionTotal += brandCommission;

    // Accumulate GMV for deduction base — exclude Enfagrow brands
    if (!ENFAGROW_EXCLUDE_PATTERN.test(brandName)) {
      deductionBaseGMV += totalGMV;
    }

    byBrand.push({
      brandId, brandName,
      platform: brandSessions[0].brand.platform,
      completedSessions: comp.length,
      totalHours, totalGMV, totalGrossRevenue, totalAdsCost, adsCostRatio, gmvPerHour,
      normalDayGMVPerHour: normalGMVPerHour,
      campaignDayGMVPerHour: campaignGMVPerHour,
      tier1KpiNormal: kpi?.bauTier1 ?? 0,
      tier2KpiNormal: kpi?.bauTier2 ?? 0,
      tier1KpiCampaign: kpi?.campTier1 ?? 0,
      tier2KpiCampaign: kpi?.campTier2 ?? 0,
      kpiAchievedTier,
      estimatedCommission: brandCommission,
      bauCommission,
      campCommission,
      kpiConfigFound: !!kpi,
      kpi1Rate,
      kpi2Rate,
      bauTier: resolvedBauTier,
      campTier: resolvedCampTier,
      sessions: sessionDetails,
    });
  }

  // Deductions applied to GMV base (0.5% of GMV excl. Enfagrow) not commission
  const hoursDeduction = hoursDeficit > hoursDeficitThreshold
    ? deductionBaseGMV * 0.005 : 0;
  const punctualityDeduction = late.length > lateThreshold
    ? deductionBaseGMV * 0.005 : 0;
  const netCommission = Math.max(0, estimatedCommissionTotal - hoursDeduction - punctualityDeduction);

  return {
    hostId, hostName: host.user.name, displayName: host.displayName,
    workingDays: host.workingDays, month, year,
    totalScheduledSessions: sessions.length,
    totalCompletedSessions: completed.length,
    missedSessions: missed.length,
    earlySessions: early.length,
    onTimeSessions: onTime.length,
    lateSessions: late.length,
    totalScheduledHours, totalActualHours, requiredHours, hoursDeficit,
    totalGMV: completed.reduce((sum, s) => sum + (s.gmv || 0), 0),
    totalGrossRevenue: completed.reduce((sum, s) => sum + ((s as any).grossRevenue || 0), 0),
    totalAdsCost: completed.reduce((sum, s) => sum + ((s as any).adsCost || 0), 0),
    byBrand, estimatedCommission: estimatedCommissionTotal,
    hoursDeduction, punctualityDeduction, netCommission,
  };
}
