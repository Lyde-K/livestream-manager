import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return `RM\u00A0${Math.round(amount).toLocaleString("en-US")}`;
}

export function formatCurrencyDetailed(amount: number): string {
  const formatted = amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `RM ${formatted}`;
}

export function formatCurrencyCompact(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `RM ${(amount / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (abs >= 10_000) return `RM ${(amount / 1_000).toFixed(0)}K`;
  if (abs >= 1_000) return `RM ${(amount / 1_000).toFixed(1)}K`;
  return `RM ${Math.round(amount).toLocaleString("en-US")}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m > 0 ? `${m}m` : ""}`.trim();
}

export function parseMYR(value: string): number {
  return parseFloat(value.replace(/[RM,\s]/g, "")) || 0;
}

export function getPunctuality(
  scheduled: Date,
  actual: Date,
  earlyMinutes = 5
): "EARLY" | "ON_TIME" | "LATE" {
  const diffMs = actual.getTime() - scheduled.getTime();
  const diffMin = diffMs / 60000;
  if (diffMin < -earlyMinutes) return "EARLY";
  if (diffMin <= 0) return "ON_TIME";
  return "LATE";
}

export function extractHostName(title: string): string | null {
  const match = title.match(/-\s*([A-Z][A-Za-z]+)\s*$/);
  return match ? match[1].toUpperCase() : null;
}

export function getMonthYear(date: Date): { month: number; year: number } {
  return { month: date.getMonth() + 1, year: date.getFullYear() };
}

// ── MYT (UTC+8) helpers ───────────────────────────────────────────────────────

const MYT_OFFSET_MS = 8 * 3_600_000;

/** Current date/time in MYT as a plain Date (UTC representation). */
export function mytNow(): Date {
  return new Date(Date.now() + MYT_OFFSET_MS);
}

/** "yyyy-MM-dd" string for today in MYT. */
export function mytToday(): string {
  return new Date(Date.now() + MYT_OFFSET_MS).toISOString().slice(0, 10);
}

/** MYT month and year from a UTC Date (or now if omitted). */
export function mytMonthYear(d?: Date): { month: number; year: number } {
  const myt = new Date((d ?? new Date()).getTime() + MYT_OFFSET_MS);
  return { month: myt.getUTCMonth() + 1, year: myt.getUTCFullYear() };
}

/** Convert a "yyyy-MM-dd" string to the Date that marks MYT midnight. */
export function mytDateStart(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+08:00`);
}
export function mytDateEnd(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59+08:00`);
}

/** MYT start/end of a calendar month given 1-based month and year. */
export function mytMonthRange(month: number, year: number): { start: Date; end: Date } {
  const padM = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate(); // day 0 of next month = last day of this
  return {
    start: new Date(`${year}-${padM}-01T00:00:00+08:00`),
    end:   new Date(`${year}-${padM}-${String(lastDay).padStart(2, "0")}T23:59:59+08:00`),
  };
}

/** Convert a stored UTC Date to its MYT date string "yyyy-MM-dd". */
export function toMytDateStr(utcDate: Date): string {
  return new Date(utcDate.getTime() + MYT_OFFSET_MS).toISOString().slice(0, 10);
}

export const PLATFORM_COLORS = {
  TIKTOK: "#010101",
  SHOPEE: "#EE4D2D",
};

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  LIVE_HOST: "Live Host",
  CLIENT: "Client",
};
