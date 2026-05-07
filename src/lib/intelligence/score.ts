import type { Flag } from "./types";

export interface ScoreInput {
  exceptionalFlags: Flag[];
  underperformingFlags: Flag[];
  roas: number | null;
}

export function computeScore(input: ScoreInput): number {
  const exceptionalCount = input.exceptionalFlags.length;
  const underperformingCount = input.underperformingFlags.length;

  let score = 50 + 10 * (exceptionalCount - underperformingCount);

  if (input.roas !== null && Number.isFinite(input.roas)) {
    if (input.roas >= 5) score += 10;
    else if (input.roas >= 3) score += 5;
    else if (input.roas < 1) score -= 10;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}
