export interface HostPermissions {
  viewMySchedule:  boolean;
  viewPerformance: boolean;
  viewLeaderboard: boolean;
  viewAIAnalysis:  boolean;
  viewLeave:       boolean;
}

const FULL_TIME_DEFAULTS: HostPermissions = {
  viewMySchedule:  true,
  viewPerformance: true,
  viewLeaderboard: true,
  viewAIAnalysis:  true,
  viewLeave:       true,
};

const PART_TIME_DEFAULTS: HostPermissions = {
  viewMySchedule:  false,
  viewPerformance: false,
  viewLeaderboard: false,
  viewAIAnalysis:  false,
  viewLeave:       false,
};

export function resolvePermissions(
  type: string,
  overrides: Partial<HostPermissions> = {}
): HostPermissions {
  const base = type === "PART_TIME" ? PART_TIME_DEFAULTS : FULL_TIME_DEFAULTS;
  return { ...base, ...overrides };
}

export const PERMISSION_KEYS = Object.keys(FULL_TIME_DEFAULTS) as (keyof HostPermissions)[];

export const PERMISSION_LABELS: Record<keyof HostPermissions, string> = {
  viewMySchedule:  "My Schedule",
  viewPerformance: "My Performance",
  viewLeaderboard: "Leaderboard",
  viewAIAnalysis:  "My AI Analysis",
  viewLeave:       "My Leave",
};
