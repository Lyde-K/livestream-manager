import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  computeConfigVersion,
  ensureGlobalConfigSeeded,
  getAllConfigs,
} from "@/lib/intelligence/config";
import type { IntelligenceConfigResolved } from "@/lib/intelligence/types";

export async function GET() {
  const session = await auth();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { role: string };
  if (user.role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const configs = await getAllConfigs();
  return Response.json(configs);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (user.role !== "ADMIN")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    await ensureGlobalConfigSeeded();
    const body = (await req.json()) as Partial<IntelligenceConfigResolved>;

    const validated = validateConfigBody(body);
    if ("error" in validated) {
      return Response.json({ error: validated.error }, { status: 400 });
    }

    const version = computeConfigVersion({
      lowPercentile: validated.lowPercentile,
      highPercentile: validated.highPercentile,
      exceptionalMinTriggers: validated.exceptionalMinTriggers,
      underperformingMinTriggers: validated.underperformingMinTriggers,
      tierPrimaryMetric: validated.tierPrimaryMetric,
      roasLowFloor: validated.roasLowFloor,
      roasHighCeiling: validated.roasHighCeiling,
      profitPerHourLowFloor: validated.profitPerHourLowFloor,
      limitedAnalysisMinTriggers: validated.limitedAnalysisMinTriggers,
      excludeMinDurationMinutes: validated.excludeMinDurationMinutes,
      enabledMetrics: validated.enabledMetrics,
      cohortDays: validated.cohortDays,
      cohortMinSize: validated.cohortMinSize,
    });

    const existing = await prisma.intelligenceConfig.findFirst({
      where: { scope: "GLOBAL" },
    });

    const data = {
      lowPercentile: validated.lowPercentile,
      highPercentile: validated.highPercentile,
      exceptionalMinTriggers: validated.exceptionalMinTriggers,
      underperformingMinTriggers: validated.underperformingMinTriggers,
      tierPrimaryMetric: validated.tierPrimaryMetric,
      roasLowFloor: validated.roasLowFloor,
      roasHighCeiling: validated.roasHighCeiling,
      profitPerHourLowFloor: validated.profitPerHourLowFloor,
      limitedAnalysisMinTriggers: validated.limitedAnalysisMinTriggers,
      excludeMinDurationMinutes: validated.excludeMinDurationMinutes,
      cohortDays: validated.cohortDays,
      cohortMinSize: validated.cohortMinSize,
      enabledMetrics: validated.enabledMetrics as unknown as object,
      configVersion: version,
      updatedBy: user.id,
    };

    const updated = existing
      ? await prisma.intelligenceConfig.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.intelligenceConfig.create({
          data: { ...data, scope: "GLOBAL", brandId: null },
        });

    return Response.json({ ok: true, configVersion: updated.configVersion });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

interface ValidatedConfig {
  lowPercentile: number;
  highPercentile: number;
  exceptionalMinTriggers: number;
  underperformingMinTriggers: number;
  tierPrimaryMetric: "gmv" | "gmvPerHour";
  roasLowFloor: number;
  roasHighCeiling: number;
  profitPerHourLowFloor: number;
  limitedAnalysisMinTriggers: number;
  excludeMinDurationMinutes: number;
  cohortDays: number;
  cohortMinSize: number;
  enabledMetrics: Record<string, boolean>;
}

export function validateConfigBody(
  body: Partial<IntelligenceConfigResolved>,
): ValidatedConfig | { error: string } {
  const num = (v: unknown, name: string, min: number, max: number) => {
    if (typeof v !== "number" || !Number.isFinite(v))
      return { error: `${name} must be a number` };
    if (v < min || v > max)
      return { error: `${name} must be between ${min} and ${max}` };
    return v;
  };
  const int = (v: unknown, name: string, min: number, max: number) => {
    if (typeof v !== "number" || !Number.isInteger(v))
      return { error: `${name} must be an integer` };
    if (v < min || v > max)
      return { error: `${name} must be between ${min} and ${max}` };
    return v;
  };

  const checks: (number | { error: string })[] = [];
  const lo = num(body.lowPercentile, "lowPercentile", 0.05, 0.3);
  const hi = num(body.highPercentile, "highPercentile", 0.7, 0.95);
  const ex = int(body.exceptionalMinTriggers, "exceptionalMinTriggers", 1, 6);
  const un = int(body.underperformingMinTriggers, "underperformingMinTriggers", 1, 6);
  const roasLow = num(body.roasLowFloor, "roasLowFloor", 0.1, 5);
  const roasHigh = num(body.roasHighCeiling, "roasHighCeiling", 2, 20);
  const pphLow = num(body.profitPerHourLowFloor, "profitPerHourLowFloor", -100000, 100000);
  const limited = int(body.limitedAnalysisMinTriggers, "limitedAnalysisMinTriggers", 1, 5);
  const minDur = int(body.excludeMinDurationMinutes, "excludeMinDurationMinutes", 0, 60);
  const cohortDays = int(body.cohortDays, "cohortDays", 14, 365);
  const cohortMin = int(body.cohortMinSize, "cohortMinSize", 1, 50);

  checks.push(lo, hi, ex, un, roasLow, roasHigh, pphLow, limited, minDur, cohortDays, cohortMin);
  for (const c of checks) {
    if (typeof c === "object" && "error" in c) return c;
  }

  if ((lo as number) >= (hi as number)) {
    return { error: "lowPercentile must be less than highPercentile" };
  }

  return {
    lowPercentile: lo as number,
    highPercentile: hi as number,
    exceptionalMinTriggers: ex as number,
    underperformingMinTriggers: un as number,
    tierPrimaryMetric: (body.tierPrimaryMetric === "gmvPerHour" ? "gmvPerHour" : "gmv") as "gmv" | "gmvPerHour",
    roasLowFloor: roasLow as number,
    roasHighCeiling: roasHigh as number,
    profitPerHourLowFloor: pphLow as number,
    limitedAnalysisMinTriggers: limited as number,
    excludeMinDurationMinutes: minDur as number,
    cohortDays: cohortDays as number,
    cohortMinSize: cohortMin as number,
    enabledMetrics:
      typeof body.enabledMetrics === "object" && body.enabledMetrics !== null
        ? (body.enabledMetrics as Record<string, boolean>)
        : {},
  };
}
