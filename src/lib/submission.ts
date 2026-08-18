import { toCsv } from "./csv";
import { formatRange, weekdayShort } from "./dates";
import { formatHours, formatTimeRange, normaliseTime, toDecimalHours } from "./shift-time";
import type { StaffTotal, SubmissionSummary } from "./types";

export interface ReportEntry {
  userId: string;
  displayName: string;
  upn: string;
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  workedMinutes: number;
  rosteredMinutes: number | null;
  note: string | null;
}

export interface BuildSummaryInput {
  storeName: string;
  storeCode: string;
  startDate: string;
  endDate: string;
  submittedBy: string;
  submittedAt: Date;
  note: string | null;
  entries: ReportEntry[];
}

/** Per-person totals for the cycle, ordered by name. */
export function buildSummary(input: BuildSummaryInput): SubmissionSummary {
  const byUser = new Map<string, StaffTotal>();

  for (const entry of input.entries) {
    let total = byUser.get(entry.userId);
    if (!total) {
      total = {
        userId: entry.userId,
        displayName: entry.displayName,
        upn: entry.upn,
        rosteredMinutes: 0,
        workedMinutes: 0,
        varianceMinutes: 0,
        days: 0,
      };
      byUser.set(entry.userId, total);
    }
    total.workedMinutes += entry.workedMinutes;
    total.rosteredMinutes += entry.rosteredMinutes ?? 0;
    total.days += 1;
  }

  const totals = [...byUser.values()]
    .map((t) => ({ ...t, varianceMinutes: t.workedMinutes - t.rosteredMinutes }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return {
    storeName: input.storeName,
    storeCode: input.storeCode,
    startDate: input.startDate,
    endDate: input.endDate,
    submittedBy: input.submittedBy,
    submittedAt: input.submittedAt.toISOString(),
    note: input.note,
    totals,
    totalWorkedMinutes: totals.reduce((sum, t) => sum + t.workedMinutes, 0),
    totalRosteredMinutes: totals.reduce((sum, t) => sum + t.rosteredMinutes, 0),
  };
}

/** Line-by-line detail: one row per shift worked, ordered by person then date. */
export function detailCsv(summary: SubmissionSummary, entries: ReportEntry[]): string {
  const sorted = [...entries].sort(
    (a, b) => a.displayName.localeCompare(b.displayName) || a.workDate.localeCompare(b.workDate),
  );

  return toCsv(
    [
      "Store",
      "Store code",
      "Pay period start",
      "Pay period end",
      "Employee",
      "Email",
      "Date",
      "Day",
      "Start",
      "Finish",
      "Unpaid break (min)",
      "Hours worked",
      "Hours rostered",
      "Variance (hrs)",
      "Note",
    ],
    sorted.map((e) => [
      summary.storeName,
      summary.storeCode,
      summary.startDate,
      summary.endDate,
      e.displayName,
      e.upn,
      e.workDate,
      weekdayShort(e.workDate),
      normaliseTime(e.startTime),
      normaliseTime(e.endTime),
      e.breakMinutes,
      formatHours(e.workedMinutes),
      e.rosteredMinutes === null ? "" : formatHours(e.rosteredMinutes),
      e.rosteredMinutes === null ? "" : formatHours(e.workedMinutes - e.rosteredMinutes),
      e.note ?? "",
    ]),
  );
}

/** One row per employee — the sheet payroll actually keys from. */
export function totalsCsv(summary: SubmissionSummary): string {
  return toCsv(
    [
      "Store",
      "Store code",
      "Pay period start",
      "Pay period end",
      "Employee",
      "Email",
      "Days worked",
      "Hours worked",
      "Hours rostered",
      "Variance (hrs)",
    ],
    summary.totals.map((t) => [
      summary.storeName,
      summary.storeCode,
      summary.startDate,
      summary.endDate,
      t.displayName,
      t.upn,
      t.days,
      formatHours(t.workedMinutes),
      formatHours(t.rosteredMinutes),
      formatHours(t.varianceMinutes),
    ]),
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function varianceCell(minutes: number): string {
  if (minutes === 0) return `<span style="color:#5b6472">0.00</span>`;
  const colour = minutes > 0 ? "#b4530a" : "#1f6f43";
  const sign = minutes > 0 ? "+" : "";
  return `<span style="color:${colour}">${sign}${formatHours(minutes)}</span>`;
}

export function submissionEmailHtml(summary: SubmissionSummary, reviewUrl: string): string {
  const rows = summary.totals
    .map(
      (t) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e6e8ec">${escapeHtml(t.displayName)}<br>
          <span style="color:#79808d;font-size:12px">${escapeHtml(t.upn)}</span></td>
        <td style="padding:8px 12px;border-bottom:1px solid #e6e8ec;text-align:right">${t.days}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e6e8ec;text-align:right">${formatHours(t.rosteredMinutes)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e6e8ec;text-align:right;font-weight:600">${formatHours(t.workedMinutes)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e6e8ec;text-align:right">${varianceCell(t.varianceMinutes)}</td>
      </tr>`,
    )
    .join("");

  const note = summary.note
    ? `<p style="margin:16px 0;padding:12px 14px;background:#f4f6f8;border-radius:8px;font-size:14px">
         <strong>Manager note:</strong> ${escapeHtml(summary.note)}</p>`
    : "";

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f0f2f5;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c2029">
  <div style="max-width:720px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#79808d">Who Gives A Shift</p>
    <h1 style="margin:0 0 4px;font-size:20px">Timesheet for ${escapeHtml(summary.storeName)}</h1>
    <p style="margin:0 0 20px;color:#5b6472;font-size:14px">
      Pay period ${escapeHtml(formatRange(summary.startDate, summary.endDate))}
      &nbsp;·&nbsp; submitted by ${escapeHtml(summary.submittedBy)}
    </p>
    ${note}
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead>
        <tr style="text-align:left;color:#79808d;font-size:12px;text-transform:uppercase;letter-spacing:.04em">
          <th style="padding:8px 12px">Employee</th>
          <th style="padding:8px 12px;text-align:right">Days</th>
          <th style="padding:8px 12px;text-align:right">Rostered</th>
          <th style="padding:8px 12px;text-align:right">Worked</th>
          <th style="padding:8px 12px;text-align:right">Variance</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="font-weight:700">
          <td style="padding:12px">Total</td>
          <td></td>
          <td style="padding:12px;text-align:right">${formatHours(summary.totalRosteredMinutes)}</td>
          <td style="padding:12px;text-align:right">${formatHours(summary.totalWorkedMinutes)}</td>
          <td style="padding:12px;text-align:right">${varianceCell(summary.totalWorkedMinutes - summary.totalRosteredMinutes)}</td>
        </tr>
      </tfoot>
    </table>
    <p style="margin:24px 0 8px">
      <a href="${escapeHtml(reviewUrl)}" style="display:inline-block;background:#1c2029;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:14px;font-weight:600">Review and respond</a>
    </p>
    <p style="margin:0;color:#79808d;font-size:12px">
      The link opens a read-only summary where you can approve or send it back. It expires in 30 days.
      Full line-by-line detail is attached as CSV. Replying to this email goes straight back to
      ${escapeHtml(summary.submittedBy)}.
    </p>
  </div>
</body></html>`;
}

export function submissionSubject(summary: SubmissionSummary): string {
  return `Timesheet · ${summary.storeName} · ${summary.startDate} to ${summary.endDate} · ${toDecimalHours(summary.totalWorkedMinutes).toFixed(2)} hrs`;
}

export { formatTimeRange };
