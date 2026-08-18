import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { payPeriods, stores, timesheetEntries, users } from "@/db/schema";
import { notFound } from "@/lib/api";
import { workedMinutes } from "@/lib/shift-time";
import { buildSummary, type ReportEntry } from "@/lib/submission";
import type { SubmissionSummary } from "@/lib/types";

/** Every timesheet line for a period, joined to the person who worked it. */
export async function reportEntries(periodId: string): Promise<ReportEntry[]> {
  const rows = await getDb()
    .select({
      userId: timesheetEntries.userId,
      displayName: users.displayName,
      upn: users.upn,
      workDate: timesheetEntries.workDate,
      startTime: timesheetEntries.startTime,
      endTime: timesheetEntries.endTime,
      breakMinutes: timesheetEntries.breakMinutes,
      rosteredMinutes: timesheetEntries.rosteredMinutes,
      note: timesheetEntries.note,
    })
    .from(timesheetEntries)
    .innerJoin(users, eq(users.id, timesheetEntries.userId))
    .where(eq(timesheetEntries.payPeriodId, periodId))
    .orderBy(asc(users.displayName), asc(timesheetEntries.workDate));

  return rows.map((r) => ({ ...r, workedMinutes: workedMinutes(r) }));
}

export interface PeriodReport {
  summary: SubmissionSummary;
  entries: ReportEntry[];
  status: "open" | "submitted" | "approved" | "rejected";
  reviewedAt: string | null;
  reviewNote: string | null;
  submitterUpn: string | null;
  storeCode: string;
}

/** Rebuilds the submitted report from source rows — nothing is snapshotted. */
export async function periodReport(periodId: string): Promise<PeriodReport> {
  const [row] = await getDb()
    .select({ period: payPeriods, store: stores })
    .from(payPeriods)
    .innerJoin(stores, eq(stores.id, payPeriods.storeId))
    .where(eq(payPeriods.id, periodId))
    .limit(1);

  if (!row) throw notFound("Pay period not found");

  let submitterName = "Unknown";
  let submitterUpn: string | null = null;
  if (row.period.submittedBy) {
    const [submitter] = await getDb()
      .select({ displayName: users.displayName, upn: users.upn })
      .from(users)
      .where(eq(users.id, row.period.submittedBy))
      .limit(1);
    if (submitter) {
      submitterName = submitter.displayName;
      submitterUpn = submitter.upn;
    }
  }

  const entries = await reportEntries(periodId);

  return {
    summary: buildSummary({
      storeName: row.store.name,
      storeCode: row.store.code,
      startDate: row.period.startDate,
      endDate: row.period.endDate,
      submittedBy: submitterName,
      submittedAt: row.period.submittedAt ?? row.period.createdAt,
      note: row.period.submissionNote,
      entries,
    }),
    entries,
    status: row.period.status,
    reviewedAt: row.period.reviewedAt?.toISOString() ?? null,
    reviewNote: row.period.reviewNote,
    submitterUpn,
    storeCode: row.store.code,
  };
}
