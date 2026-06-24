export function calcNextDue(from: Date, rec: { freq: string; interval?: number }): Date {
  const d = new Date(from);
  const n = Math.max(1, rec.interval ?? 1);
  if (rec.freq === "daily")        d.setDate(d.getDate() + n);
  else if (rec.freq === "weekly")  d.setDate(d.getDate() + n * 7);
  else if (rec.freq === "monthly") d.setMonth(d.getMonth() + n);
  else if (rec.freq === "yearly")  d.setFullYear(d.getFullYear() + n);
  return d;
}
