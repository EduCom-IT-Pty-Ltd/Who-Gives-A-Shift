/**
 * Wall-clock shift arithmetic. Times are `HH:MM` or `HH:MM:SS` strings; a shift
 * whose end is at or before its start is treated as running past midnight.
 */

export const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

export function timeToMinutes(value: string): number {
  const m = TIME_RE.exec(value);
  if (!m) throw new Error(`Invalid time: ${value}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Normalise Postgres `time` output (`09:00:00`) to `09:00` for inputs. */
export function normaliseTime(value: string): string {
  if (!TIME_RE.test(value)) return value;
  return value.slice(0, 5);
}

/** Elapsed minutes, adding a day when the shift crosses midnight. */
export function spanMinutes(startTime: string, endTime: string): number {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return end > start ? end - start : end + 1440 - start;
}

export function crossesMidnight(startTime: string, endTime: string): boolean {
  return timeToMinutes(endTime) <= timeToMinutes(startTime);
}

export interface WorkedInput {
  startTime: string;
  endTime: string;
  breakMinutes: number;
}

/** Paid minutes: elapsed time less unpaid breaks, never negative. */
export function workedMinutes({ startTime, endTime, breakMinutes }: WorkedInput): number {
  return Math.max(0, spanMinutes(startTime, endTime) - Math.max(0, breakMinutes));
}

/** Decimal hours to 2dp — the form payroll expects. */
export function toDecimalHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

export function formatHours(minutes: number): string {
  return toDecimalHours(minutes).toFixed(2);
}

/** `7h 30m`, for on-screen reading. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatTimeRange(startTime: string, endTime: string): string {
  const suffix = crossesMidnight(startTime, endTime) ? " +1" : "";
  return `${normaliseTime(startTime)}–${normaliseTime(endTime)}${suffix}`;
}
