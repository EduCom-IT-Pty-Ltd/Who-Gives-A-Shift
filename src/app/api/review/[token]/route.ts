import { badRequest, json, route } from "@/lib/api";
import { periodReport } from "@/lib/report";
import { verifyReviewToken } from "@/lib/review-token";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

/** Capability-URL read for the external reviewer. No Entra account involved. */
export const GET = route(async (_request: Request, { params }: Params) => {
  const { token } = await params;
  const result = verifyReviewToken(token);

  if (!result.ok) {
    throw badRequest(
      result.reason === "expired"
        ? "This review link has expired. Ask the store manager to re-send it."
        : "This review link is not valid.",
    );
  }

  const report = await periodReport(result.payPeriodId);
  return json({
    summary: report.summary,
    entries: report.entries,
    status: report.status,
    reviewedAt: report.reviewedAt,
    reviewNote: report.reviewNote,
    expiresAt: result.expiresAt.toISOString(),
  });
});
