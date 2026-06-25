/**
 * MYT (Malaysia Time, UTC+8) display utilities.
 *
 * NEVER pass a manually +8h-shifted timestamp to date-fns `format()`.
 * date-fns `format()` applies the browser's LOCAL timezone on top of whatever
 * Date you pass, so in a UTC+8 browser the shift is applied twice, pushing
 * every evening session into the following day.
 *
 * Use these helpers everywhere you need to derive a date/time string from a
 * UTC ISO value stored in the database.
 */

import { format, parseISO } from "date-fns";

const MYT_OFFSET_MS = 8 * 3_600_000;

function toMYT(value: string | Date): Date {
  const ms = typeof value === "string" ? new Date(value).getTime() : value.getTime();
  return new Date(ms + MYT_OFFSET_MS);
}

/** "YYYY-MM-DD" in MYT — safe regardless of browser timezone. */
export function mytDateStr(value: string | Date): string {
  return toMYT(value).toISOString().slice(0, 10);
}

/** "YYYY-MM" in MYT — safe regardless of browser timezone. */
export function mytMonthStr(value: string | Date): string {
  return toMYT(value).toISOString().slice(0, 7);
}

/**
 * Format a UTC date/string as a MYT display string using a date-fns format
 * pattern (e.g. "HH:mm", "dd MMM yyyy", "d").
 *
 * Works by converting the UTC time to a plain local-looking ISO string
 * ("YYYY-MM-DDTHH:mm") so that date-fns parseISO treats it as local time,
 * which then round-trips correctly through format() regardless of the
 * browser's timezone.
 */
export function formatMYT(value: string | Date, fmt: string): string {
  const myt = toMYT(value);
  return format(parseISO(myt.toISOString().slice(0, 16)), fmt);
}
