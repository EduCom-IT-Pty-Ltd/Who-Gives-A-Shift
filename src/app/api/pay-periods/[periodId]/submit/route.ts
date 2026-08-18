import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { payPeriods } from "@/db/schema";
import { authenticate } from "@/lib/auth/context";
import { recordAudit } from "@/lib/audit";
import { badRequest, conflict, json, route } from "@/lib/api";
import { appBaseUrl, reviewerEmail } from "@/lib/env";
import { isGraphConfigured, sendMailAsUser } from "@/lib/graph";
import { isPayPeriodSubmittable, payPeriodFor } from "@/lib/pay-period";
import { createReviewToken } from "@/lib/review-token";
import {
  buildSummary,
  detailCsv,
  submissionEmailHtml,
  submissionSubject,
  totalsCsv,
} from "@/lib/submission";
import { reportEntries } from "@/lib/report";
import { requireManagedPeriod } from "@/lib/period-access";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Params = { params: Promise<{ periodId: string }> };

const submitBody = z.object({
  note: z.string().trim().max(1000).nullish(),
  /** Re-send the email for an already-submitted period without re-locking it. */
  resend: z.boolean().default(false),
});

/**
 * Locks the pay period and emails the timesheet to the reviewer. The lock is
 * written before the send: a period that reached payroll must never be editable
 * afterwards, and a failed send is recoverable with `resend`.
 */
export const POST = route(async (request: Request, { params }: Params) => {
  const auth = await authenticate(request);
  const { periodId } = await params;
  const { period, store } = await requireManagedPeriod(auth, periodId);

  const input = submitBody.parse(await request.json().catch(() => ({})));
  const range = payPeriodFor(period.startDate);

  if (!input.resend) {
    if (period.status !== "open") {
      throw conflict("This pay period has already been submitted");
    }
    if (!auth.isAdmin && !isPayPeriodSubmittable(range, store.timezone)) {
      throw badRequest(
        `This pay period cannot be submitted until it closes on ${range.endDate}`,
      );
    }
  } else if (period.status === "open") {
    throw conflict("This pay period has not been submitted yet");
  }

  const entries = await reportEntries(periodId);
  if (!entries.length) throw badRequest("There are no hours to submit for this period");

  const to = reviewerEmail();
  const submittedAt = period.submittedAt ?? new Date();
  const note = input.resend ? period.submissionNote : (input.note ?? null);

  if (!input.resend) {
    await getDb()
      .update(payPeriods)
      .set({
        status: "submitted",
        submittedAt,
        submittedBy: auth.user.id,
        submissionNote: note,
        reviewerEmail: to,
      })
      .where(eq(payPeriods.id, periodId));
  }

  const summary = buildSummary({
    storeName: store.name,
    storeCode: store.code,
    startDate: range.startDate,
    endDate: range.endDate,
    submittedBy: auth.user.displayName,
    submittedAt,
    note: note ?? null,
    entries,
  });

  const reviewUrl = `${appBaseUrl()}/review/${createReviewToken(periodId)}`;
  const stem = `${store.code}-${range.startDate}-to-${range.endDate}`;

  let emailed = false;
  let emailError: string | null = null;

  if (!isGraphConfigured()) {
    emailError = "Microsoft Graph is not configured, so no email was sent.";
  } else {
    try {
      await sendMailAsUser(auth.accessToken, {
        to: [to],
        subject: submissionSubject(summary),
        html: submissionEmailHtml(summary, reviewUrl),
        attachments: [
          {
            name: `${stem}-totals.csv`,
            contentType: "text/csv",
            content: totalsCsv(summary),
          },
          {
            name: `${stem}-detail.csv`,
            contentType: "text/csv",
            content: detailCsv(summary, entries),
          },
        ],
      });
      emailed = true;
    } catch (error) {
      emailError = error instanceof Error ? error.message : "Unknown mail error";
      console.error("Timesheet email failed", periodId, error);
    }
  }

  await recordAudit({
    actorUserId: auth.user.id,
    actorLabel: auth.user.upn,
    action: input.resend ? "timesheet.resend" : "timesheet.submit",
    entity: "pay_period",
    entityId: periodId,
    detail: {
      storeId: store.id,
      range,
      to,
      emailed,
      emailError,
      totalHours: summary.totalWorkedMinutes / 60,
      people: summary.totals.length,
    },
  });

  return json({ ok: true, emailed, emailError, reviewerEmail: to, reviewUrl, summary });
});
