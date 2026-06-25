import { prisma } from "@/lib/prisma";
import { getDaysInMonth } from "date-fns";
import { mytMonthRange } from "@/lib/utils";

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
  adsCostRatio: number; // adsCost / grossRevenue (lower = better ROI)
  gmvPerHour: number;
  normalDayGMVPerHour: number;
  campaignDayGMVPerHour: number;
  tier1KpiNormal: number;
  tier2KpiNormal: number;
  tier1KpiCampaign: number;
  tier2KpiCampaign: number;
  kpiAchievedTier: 0 | 1 | 2;
  estimatedCommission: number;
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
  adsCostRatio: number | null; // adsCost / grossRevenue
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

  const rule = await prisma.commissionRule.findFirst({ where: { isDefault: true } });
  const lateThreshold = rule?.lateSessionsThreshold ?? 5;
  const lateDeductionPct = rule?.lateDeductionPct ?? 0.5;
  const hoursDeficitThreshold = rule?.hoursDeficitThreshold ?? 5;
  const hoursDeductionPct = rule?.hoursDeductionPct ?? 0.5;

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

  // Required hours: workingDays per week × 6h × (weeks in month approximation)
  // More accurate: count working days in the specific month
  const daysInMonth = getDaysInMonth(monthStart);
  const weeksApprox = daysInMonth / 7;
  const requiredHours = host.workingDays * weeksApprox * 6;
  const hoursDeficit = Math.max(0, requiredHours - totalActualHours);

  // Group by brand
  const brandMap = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const arr = brandMap.get(s.brandId) || [];
    arr.push(s);
    brandMap.set(s.brandId, arr);
  }

  const kpiConfigs = await prisma.kPIConfig.findMany({
    where: { liveHostId: hostId, month, year },
  });

  const byBrand: BrandStats[] = [];
  let estimatedCommissionTotal = 0;

  for (const [brandId, brandSessions] of brandMap) {
    const comp = brandSessions.filter((s) => s.status === "COMPLETED");
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

    // Session-level detail
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

    const kpi = kpiConfigs.find((k) => k.brandId === brandId);
    let kpiAchievedTier: 0 | 1 | 2 = 0;
    let commission = 0;

    if (kpi) {
      // Determine KPI tier based on normal day GMV/hour
      if (normalGMVPerHour >= (kpi.tier2KpiNormal || 0) && kpi.tier2KpiNormal > 0) {
        kpiAchievedTier = 2;
        commission = totalGMV * (kpi.tier2Rate / 100);
      } else if (normalGMVPerHour >= (kpi.tier1KpiNormal || 0) && kpi.tier1KpiNormal > 0) {
        kpiAchievedTier = 1;
        commission = totalGMV * (kpi.tier1Rate / 100);
      } else {
        commission = totalGMV * (kpi.baseCommissionRate / 100);
      }
    }

    estimatedCommissionTotal += commission;

    byBrand.push({
      brandId, brandName: brandSessions[0].brand.name,
      platform: brandSessions[0].brand.platform,
      completedSessions: comp.length,
      totalHours, totalGMV, totalGrossRevenue, totalAdsCost, adsCostRatio, gmvPerHour,
      normalDayGMVPerHour: normalGMVPerHour,
      campaignDayGMVPerHour: campaignGMVPerHour,
      tier1KpiNormal: kpi?.tier1KpiNormal ?? 0,
      tier2KpiNormal: kpi?.tier2KpiNormal ?? 0,
      tier1KpiCampaign: kpi?.tier1KpiCampaign ?? 0,
      tier2KpiCampaign: kpi?.tier2KpiCampaign ?? 0,
      kpiAchievedTier,
      estimatedCommission: commission,
      sessions: sessionDetails,
    });
  }

  const hoursDeduction = hoursDeficit > hoursDeficitThreshold
    ? estimatedCommissionTotal * (hoursDeductionPct / 100) : 0;
  const punctualityDeduction = late.length > lateThreshold
    ? estimatedCommissionTotal * (lateDeductionPct / 100) : 0;
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
