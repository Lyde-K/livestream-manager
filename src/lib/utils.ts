import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return `RM ${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
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

export const PLATFORM_COLORS = {
  TIKTOK: "#010101",
  SHOPEE: "#EE4D2D",
};

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  LIVE_HOST: "Live Host",
  CLIENT: "Client",
};
