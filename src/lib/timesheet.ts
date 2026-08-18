import { and, asc, between, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { payPeriods, shifts, timesheetEntries, users, type Store } from "@/db/schema";
import { conflict } from "@/lib/api";
import { isPayPeriodSubmittable, payPeriodDays, type PayPeriodRange } from "@/lib/pay-period";
import { normaliseTime, workedMinutes } from "@/lib/shift-time";
import type { PayPeriodDto, TimesheetEntryDto, TimesheetResponse } from "@/lib/types";
import { listMembers } from "@/lib/members";

export async function findPeriod(storeId: string, startDate: string) {
  const [period] = await getDb()
    .select()
    .from(payPeriods)
    .where(and(eq(payPeriods.storeId, storeId), eq(payPeriods.startDate, startDate)))
    .limit(1);
  return period ?? null;
}

export function isLocked(status: PayPeriodDto["status"]): boolean {
  return status !== "open";
}

/**
 * Creates the pay period on first open and seeds one timesheet line per
 * published shift. Seeding is one-shot: once entries exist the manager's
 * corrections are authoritative and re-opening must never overwrite them.
 */
export async function preparePeriod(
  store: Store,
  range: PayPeriodRange,
): Promise<{ periodId: string; seeded: number }> {
  const db = getDb();

  const [period] = await db
    .insert(payPeriods)
    .values({ storeId: store.id, startDate: range.startDate, endDate: range.endDate })
    .onConflictDoUpdate({
      target: [payPeriods.storeId, payPeriods.startDate],
      set: { endDate: range.endDate },
    })
    .returning();

  if (isLocked(period.status)) return { periodId: period.id, seeded: 0 };

  const existing = await db
    .select({ id: timesheetEntries.id })
    .from(timesheetEntries)
    .where(eq(timesheetEntries.payPeriodId, period.id))
    .limit(1);

  if (existing.length) return { periodId: period.id, seeded: 0 };

  const rostered = await db
    .select()
    .from(shifts)
    .where(
      and(
        eq(shifts.storeId, store.id),
        eq(shifts.status, "published"),
        between(shifts.workDate, range.startDate, range.endDate),
      ),
    )
    .orderBy(asc(shifts.workDate), asc(shifts.startTime));

  if (!rostered.length) return { periodId: period.id, seeded: 0 };

  await db.insert(timesheetEntries).values(
    rostered.map((shift) => ({
      payPeriodId: period.id,
      userId: shift.userId,
      shiftId: shift.id,
      workDate: shift.workDate,
      startTime: shift.startTime,
      endTime: shift.endTime,
      breakMinutes: shift.breakMinutes,
      rosteredMinutes: workedMinutes({
        startTime: shift.startTime,
        endTime: shift.endTime,
        breakMinutes: shift.breakMinutes,
      }),
    })),
  );

  return { periodId: period.id, seeded: rostered.length };
}

export function toPeriodDto(
  storeId: string,
  range: PayPeriodRange,
  period: Awaited<ReturnType<typeof findPeriod>>,
  submittedByName: string | null,
): PayPeriodDto {
  return {
    id: period?.id ?? null,
    storeId,
    startDate: range.startDate,
    endDate: range.endDate,
    status: period?.status ?? "open",
    submittedAt: period?.submittedAt?.toISOString() ?? null,
    submittedByName,
    submissionNote: period?.submissionNote ?? null,
    reviewerEmail: period?.reviewerEmail ?? null,
    reviewedAt: period?.reviewedAt?.toISOString() ?? null,
    reviewNote: period?.reviewNote ?? null,
  };
}

export function toEntryDto(row: {
  id: string;
  userId: string;
  shiftId: string | null;
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  rosteredMinutes: number | null;
  note: string | null;
}): TimesheetEntryDto {
  return {
    id: row.id,
    userId: row.userId,
    shiftId: row.shiftId,
    workDate: row.workDate,
    startTime: normaliseTime(row.startTime),
    endTime: normaliseTime(row.endTime),
    breakMinutes: row.breakMinutes,
    rosteredMinutes: row.rosteredMinutes,
    note: row.note,
    workedMinutes: workedMinutes({
      startTime: row.startTime,
      endTime: row.endTime,
      breakMinutes: row.breakMinutes,
    }),
  };
}

export interface LoadOptions {
  /** Staff see only their own lines. */
  restrictToUserId?: string;
  canManage: boolean;
  isAdmin: boolean;
}

export async function loadTimesheet(
  store: Store,
  range: PayPeriodRange,
  options: LoadOptions,
): Promise<TimesheetResponse> {
  const db = getDb();
  const period = await findPeriod(store.id, range.startDate);

  let submittedByName: string | null = null;
  if (period?.submittedBy) {
    const [submitter] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, period.submittedBy))
      .limit(1);
    submittedByName = submitter?.displayName ?? null;
  }

  const conditions = period ? [eq(timesheetEntries.payPeriodId, period.id)] : [];
  if (options.restrictToUserId) {
    conditions.push(eq(timesheetEntries.userId, options.restrictToUserId));
  }

  const rows = period
    ? await db
        .select()
        .from(timesheetEntries)
        .where(and(...conditions))
        .orderBy(asc(timesheetEntries.workDate), asc(timesheetEntries.startTime))
    : [];

  const dto = toPeriodDto(store.id, range, period, submittedByName);
  const submittable = options.isAdmin || isPayPeriodSubmittable(range, store.timezone);

  return {
    store: {
      id: store.id,
      name: store.name,
      code: store.code,
      timezone: store.timezone,
      canManage: options.canManage,
    },
    period: dto,
    days: payPeriodDays(range),
    members: options.canManage ? await listMembers(store.id) : [],
    entries: rows.map(toEntryDto),
    locked: isLocked(dto.status),
    canSubmit: options.canManage && !isLocked(dto.status) && submittable && rows.length > 0,
    periodComplete: submittable,
  };
}

/** Guards every write against a period that has already gone to payroll. */
export function assertEditable(status: PayPeriodDto["status"]): void {
  if (isLocked(status)) {
    throw conflict("This pay period has been submitted and can no longer be edited");
  }
}
