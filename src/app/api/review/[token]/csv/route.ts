import { badRequest, route } from "@/lib/api";
import { periodReport } from "@/lib/report";
import { verifyReviewToken } from "@/lib/review-token";
import { detailCsv, totalsCsv } from "@/lib/submission";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const { token } = await params;
  const result = verifyReviewToken(token);
  if (!result.ok) throw badRequest("This review link is not valid.");

  const report = await periodReport(result.payPeriodId);
  const wantsDetail = new URL(request.url).searchParams.get("type") !== "totals";
  const body = wantsDetail
    ? detailCsv(report.summary, report.entries)
    : totalsCsv(report.summary);

  const stem = `${report.storeCode}-${report.summary.startDate}-to-${report.summary.endDate}`;

  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${stem}-${wantsDetail ? "detail" : "totals"}.csv"`,
      "cache-control": "no-store",
    },
  });
});
