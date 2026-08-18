import { addDays, daysBetween, parseISODate, todayInZone, toISODate } from "./dates";

/** Pay cycle runs Thursday through the following Wednesday. */
export const PAY_PERIOD_START_DOW = 4; // Thursday, per Date#getUTCDay
export const PAY_PERIOD_LENGTH_DAYS = 7;

export interface PayPeriodRange {
  startDate: string; // Thursday
  endDate: string; // the following Wednesday
}

/** The Thursday-to-Wednesday cycle containing `iso`. */
export function payPeriodFor(iso: string): PayPeriodRange {
  const dow = parseISODate(iso).getUTCDay();
  const offset = (dow - PAY_PERIOD_START_DOW + 7) % 7;
  const startDate = addDays(iso, -offset);
  return { startDate, endDate: addDays(startDate, PAY_PERIOD_LENGTH_DAYS - 1) };
}

export function currentPayPeriod(timeZone: string): PayPeriodRange {
  return payPeriodFor(todayInZone(timeZone));
}

export function shiftPayPeriod(range: PayPeriodRange, periods: number): PayPeriodRange {
  const startDate = addDays(range.startDate, periods * PAY_PERIOD_LENGTH_DAYS);
  return { startDate, endDate: addDays(startDate, PAY_PERIOD_LENGTH_DAYS - 1) };
}

/** Every date in the cycle, Thursday first. */
export function payPeriodDays(range: PayPeriodRange): string[] {
  return Array.from({ length: PAY_PERIOD_LENGTH_DAYS }, (_, i) => addDays(range.startDate, i));
}

export function isValidPayPeriodStart(iso: string): boolean {
  return parseISODate(iso).getUTCDay() === PAY_PERIOD_START_DOW;
}

export function containsDate(range: PayPeriodRange, iso: string): boolean {
  const offset = daysBetween(range.startDate, iso);
  return offset >= 0 && offset < PAY_PERIOD_LENGTH_DAYS;
}

/**
 * Submission opens on the cycle's closing Wednesday, in the store's own
 * timezone — managers finalise on the day, not the morning after.
 */
export function isPayPeriodSubmittable(range: PayPeriodRange, timeZone: string): boolean {
  return todayInZone(timeZone) >= range.endDate;
}

/** True once the cycle is fully in the past. */
export function isPayPeriodComplete(range: PayPeriodRange, timeZone: string): boolean {
  return todayInZone(timeZone) > range.endDate;
}

/** The Wednesday this cycle closes, for "submit by" messaging. */
export function closesOn(range: PayPeriodRange): string {
  return range.endDate;
}

export function periodLabel(range: PayPeriodRange): string {
  return `${range.startDate} → ${range.endDate}`;
}

export { toISODate };
