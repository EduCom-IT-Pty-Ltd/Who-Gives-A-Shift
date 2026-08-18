/**
 * Display helpers for a recurring week. Kept apart from `standard-hours.ts`
 * because that module reaches for the database and this runs in the browser.
 */
import { PAY_PERIOD_LENGTH_DAYS, PAY_PERIOD_START_DOW } from "./pay-period";
import { formatDuration } from "./shift-time";
import type { StandardShiftDto } from "./types";

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Weekday numbers in pay-cycle order, so the editor matches the roster board. */
export const PERIOD_WEEKDAYS: number[] = Array.from(
  { length: PAY_PERIOD_LENGTH_DAYS },
  (_, i) => (PAY_PERIOD_START_DOW + i) % 7,
);

export const weekdayLabel = (weekday: number): string => WEEKDAY_LABELS[weekday];
export const weekdayShortLabel = (weekday: number): string => WEEKDAY_SHORT[weekday];

/** `Thu Fri Mon · 22h 30m a week`, or null when nothing is defined. */
export function summariseStandardWeek(shifts: StandardShiftDto[]): string | null {
  if (!shifts.length) return null;

  const days = PERIOD_WEEKDAYS.filter((d) => shifts.some((s) => s.weekday === d));
  const minutes = shifts.reduce((total, s) => total + s.workedMinutes, 0);

  return `${days.map(weekdayShortLabel).join(" ")} · ${formatDuration(minutes)} a week`;
}

export interface PresetSlot {
  weekday: number;
  startTime: string;
  endTime: string;
  breakMinutes: number;
}

export interface StandardWeekPreset {
  id: string;
  label: string;
  hint: string;
  slots: PresetSlot[];
}

/** Monday to Friday, in `Date#getUTCDay` numbering. */
const MON_TO_FRI = [1, 2, 3, 4, 5];

/**
 * Ready-made weeks a manager can start from. Full time is the standard
 * 38-hour week: 9:00 to 5:30 across five days, less a 54 minute unpaid break,
 * which is 7.6 paid hours a day.
 */
export const STANDARD_WEEK_PRESETS: StandardWeekPreset[] = [
  {
    id: "full-time",
    label: "Full time",
    hint: "Mon–Fri, 9:00–5:30 with a 54 minute break · 38 hours a week",
    slots: MON_TO_FRI.map((weekday) => ({
      weekday,
      startTime: "09:00",
      endTime: "17:30",
      breakMinutes: 54,
    })),
  },
];
