/**
 * Date helpers that operate on `YYYY-MM-DD` strings via UTC-midnight Dates.
 * Nothing here touches the host timezone, so a roster date means the same thing
 * on a Sydney laptop and a Vercel box running UTC.
 */

const DAY_MS = 86_400_000;

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseISODate(iso: string): Date {
  if (!ISO_DATE.test(iso)) throw new Error(`Invalid date: ${iso}`);
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${iso}`);
  return d;
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return toISODate(new Date(parseISODate(iso).getTime() + days * DAY_MS));
}

export function daysBetween(fromISO: string, toISOStr: string): number {
  return Math.round((parseISODate(toISOStr).getTime() - parseISODate(fromISO).getTime()) / DAY_MS);
}

/** Current calendar date in an IANA zone, as YYYY-MM-DD. */
export function todayInZone(timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function weekdayShort(iso: string): (typeof WEEKDAYS)[number] {
  return WEEKDAYS[parseISODate(iso).getUTCDay()];
}

export function formatDayLabel(iso: string): string {
  const d = parseISODate(iso);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${d.toLocaleString("en-AU", {
    month: "short",
    timeZone: "UTC",
  })}`;
}

export function formatRange(startISO: string, endISO: string): string {
  return `${formatDayLabel(startISO)} – ${formatDayLabel(endISO)}`;
}
