/**
 * Canonical helpers for reading and writing MonthlyGMVTarget records.
 *
 * CONVENTION: month is always 1-based (1 = January, 12 = December).
 * This matches mytMonthYear() output and the values stored by /api/gmv-target.
 *
 * Never pass Date.getMonth() (0-based) directly — use Date.getMonth() + 1.
 */

import { prisma } from "@/lib/prisma";

export async function getGMVTarget(
  brandId: string,
  month: number,  // 1-based
  year: number,
): Promise<number> {
  const rec = await prisma.monthlyGMVTarget.findUnique({
    where: { brandId_month_year: { brandId, month, year } },
  });
  return rec?.target ?? 0;
}

export async function upsertGMVTarget(
  brandId: string,
  month: number,  // 1-based
  year: number,
  target: number,
) {
  return prisma.monthlyGMVTarget.upsert({
    where: { brandId_month_year: { brandId, month, year } },
    update: { target },
    create: { brandId, month, year, target },
  });
}

/** Returns all targets whose (year, month) falls within the date range. */
export async function getGMVTargetsForRange(
  rangeStart: Date,
  rangeEnd: Date,
): Promise<{ brandId: string; month: number; year: number; target: number }[]> {
  // Build the set of (year, month-1-based) pairs that overlap the range
  const all = await prisma.monthlyGMVTarget.findMany();
  const monthSet = new Set<string>();
  const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  while (cursor <= rangeEnd) {
    monthSet.add(`${cursor.getFullYear()}-${cursor.getMonth() + 1}`); // 1-based
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return all.filter(t => monthSet.has(`${t.year}-${t.month}`));
}
