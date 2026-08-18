import { z } from "zod";
import { ISO_DATE } from "./dates";
import { TIME_RE } from "./shift-time";

export const isoDate = z.string().regex(ISO_DATE, "Expected a YYYY-MM-DD date");
export const clockTime = z
  .string()
  .regex(TIME_RE, "Expected a HH:MM time")
  .transform((v) => v.slice(0, 5));

export const shiftBody = z.object({
  userId: z.string().uuid(),
  workDate: isoDate,
  startTime: clockTime,
  endTime: clockTime,
  breakMinutes: z.number().int().min(0).max(720).default(0),
  label: z.string().trim().max(60).nullish(),
  notes: z.string().trim().max(500).nullish(),
});

export const shiftPatchBody = shiftBody.partial().omit({ userId: true }).extend({
  userId: z.string().uuid().optional(),
});

export const standardShiftBody = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: clockTime,
  endTime: clockTime,
  breakMinutes: z.number().int().min(0).max(720).default(0),
  label: z.string().trim().max(60).nullish(),
});

/** The editor always submits the whole week, so the payload is the whole week. */
export const standardHoursBody = z.object({
  shifts: z.array(standardShiftBody).max(21),
});
