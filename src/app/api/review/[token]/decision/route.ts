import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { payPeriods } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { badRequest, conflict, json, route } from "@/lib/api";
import { appBaseUrl } from "@/lib/env";
import { isGraphConfigured, sendMailAsApp } from "@/lib/graph";
import { periodReport } from "@/lib/report";
import { verifyReviewToken } from "@/lib/review-token";
import { formatRange } from "@/lib/dates";
import { formatHours } from "@/lib/shift-time";
import { submissionReviewerSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

const decisionBody = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(1000).nullish(),
});

/**
 * The reviewer's verdict. Rejection reopens the period so the manager can fix
 * it and resubmit; approval is final and leaves it locked.
 */
export const POST = route(async (request: Request, { params }: Params) => {
  const { token } = await params;
  const result = verifyReviewToken(token);
  if (!result.ok) {
    throw badRequest(
      result.reason === "expired"
        ? "This review link has expired."
        : "This review link is not valid.",
    );
  }

  const input = decisionBody.parse(await request.json());
  const report = await periodReport(result.payPeriodId);

  if (report.status === "open") throw conflict("This pay period has not been submitted yet");
  if (report.status === "approved") throw conflict("This pay period has already been approved");

  if (input.decision === "rejected" && !input.note) {
    throw badRequest("Please say what needs changing before sending it back");
  }

  await getDb()
    .update(payPeriods)
    .set({
      // Sending it back reopens editing; approving keeps the period locked.
      status: input.decision === "approved" ? "approved" : "open",
      reviewedAt: new Date(),
      reviewNote: input.note ?? null,
    })
    .where(eq(payPeriods.id, result.payPeriodId));

  await recordAudit({
    actorLabel: `review-link:${report.summary.storeCode}`,
    action: `timesheet.${input.decision}`,
    entity: "pay_period",
    entityId: result.payPeriodId,
    detail: { note: input.note ?? null, storeCode: report.storeCode },
  });

  if (report.submitterUpn && isGraphConfigured()) {
    const verdict = input.decision === "approved" ? "approved" : "sent back for changes";
    try {
      const { email: reviewer } = await submissionReviewerSetting();
      await sendMailAsApp(reviewer, {
        to: [report.submitterUpn],
        subject: `Timesheet ${verdict} · ${report.summary.storeName} · ${report.summary.startDate} to ${report.summary.endDate}`,
        html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;color:#1c2029">
          <p>Your timesheet for <strong>${report.summary.storeName}</strong>
             (${formatRange(report.summary.startDate, report.summary.endDate)},
             ${formatHours(report.summary.totalWorkedMinutes)} hours) has been <strong>${verdict}</strong>.</p>
          ${input.note ? `<p style="padding:12px 14px;background:#f4f6f8;border-radius:8px"><strong>Reviewer note:</strong> ${input.note.replace(/</g, "&lt;")}</p>` : ""}
          <p><a href="${appBaseUrl()}/timesheets">Open Who Gives A Shift</a></p>
        </div>`,
      });
    } catch (error) {
      console.error("Failed to notify submitter of review decision", error);
    }
  }

  return json({ ok: true, status: input.decision });
});
