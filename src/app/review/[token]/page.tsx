"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Loading, Note } from "@/components/ui";
import { formatDayLabel, formatRange, weekdayShort } from "@/lib/dates";
import { formatHours, formatTimeRange } from "@/lib/shift-time";
import type { ReportEntry } from "@/lib/submission";
import type { SubmissionSummary } from "@/lib/types";

interface ReviewPayload {
  summary: SubmissionSummary;
  entries: ReportEntry[];
  status: "open" | "submitted" | "approved" | "rejected";
  reviewedAt: string | null;
  reviewNote: string | null;
  expiresAt: string;
}

/**
 * The external reviewer's view. Reached by capability URL rather than sign-in,
 * because the reviewer sits outside the tenant.
 */
export default function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [data, setData] = useState<ReviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/review/${token}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Could not open this review");
      setData(body as ReviewPayload);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this review");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (decision: "approved" | "rejected") => {
    if (decision === "rejected" && !note.trim()) {
      setError("Please say what needs changing before sending it back.");
      return;
    }
    setBusy(decision);
    setError(null);
    try {
      const response = await fetch(`/api/review/${token}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, note: note.trim() || null }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Could not record your decision");
      setDone(
        decision === "approved"
          ? "Approved. The store manager has been notified."
          : "Sent back to the store manager with your note.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record your decision");
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data) return <Loading label="Opening timesheet…" />;

  if (!data) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <Note tone="bad">{error ?? "This review link is not valid."}</Note>
      </main>
    );
  }

  const { summary } = data;
  const settled = data.status === "approved";
  const reopened = data.status === "open" && Boolean(data.reviewedAt);

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
          Who Gives A Shift · timesheet review
        </p>
        <h1 className="text-xl font-semibold tracking-tight">{summary.storeName}</h1>
        <p className="text-sm text-muted">
          {formatRange(summary.startDate, summary.endDate)} · submitted by {summary.submittedBy} on{" "}
          {new Date(summary.submittedAt).toLocaleString("en-AU")}
        </p>
      </header>

      {done && <Note tone="good">{done}</Note>}
      {error && <Note tone="bad">{error}</Note>}
      {settled && !done && <Note tone="good">This timesheet has already been approved.</Note>}
      {reopened && !done && (
        <Note tone="warn">
          This was sent back to the store manager. It will arrive again once they resubmit.
        </Note>
      )}
      {summary.note && (
        <Note tone="info">
          <strong>Manager note:</strong> {summary.note}
        </Note>
      )}

      <Card
        title="Hours by person"
        action={
          <div className="flex gap-2">
            <a
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
              href={`/api/review/${token}/csv?type=totals`}
            >
              Totals CSV
            </a>
            <a
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
              href={`/api/review/${token}/csv?type=detail`}
            >
              Detail CSV
            </a>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="px-4 py-2 text-left font-medium">Employee</th>
                <th className="px-3 py-2 text-right font-medium">Days</th>
                <th className="px-3 py-2 text-right font-medium">Rostered</th>
                <th className="px-3 py-2 text-right font-medium">Worked</th>
                <th className="px-4 py-2 text-right font-medium">Variance</th>
              </tr>
            </thead>
            <tbody>
              {summary.totals.map((total) => (
                <tr key={total.userId} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <span className="block font-medium">{total.displayName}</span>
                    <span className="block text-xs text-muted">{total.upn}</span>
                  </td>
                  <td className="nums px-3 py-2 text-right">{total.days}</td>
                  <td className="nums px-3 py-2 text-right text-muted">
                    {formatHours(total.rosteredMinutes)}
                  </td>
                  <td className="nums px-3 py-2 text-right font-semibold">
                    {formatHours(total.workedMinutes)}
                  </td>
                  <td className="nums px-4 py-2 text-right">
                    {total.varianceMinutes === 0 ? (
                      <span className="text-muted">0.00</span>
                    ) : (
                      <Badge tone={total.varianceMinutes > 0 ? "warn" : "good"}>
                        {total.varianceMinutes > 0 ? "+" : ""}
                        {formatHours(total.varianceMinutes)}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold">
                <td className="px-4 py-3">Total</td>
                <td />
                <td className="nums px-3 py-3 text-right">
                  {formatHours(summary.totalRosteredMinutes)}
                </td>
                <td className="nums px-3 py-3 text-right">
                  {formatHours(summary.totalWorkedMinutes)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card
        title="Shift-by-shift detail"
        action={
          <Button onClick={() => setShowDetail((v) => !v)}>
            {showDetail ? "Hide" : `Show ${data.entries.length} shifts`}
          </Button>
        }
      >
        {showDetail && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="px-4 py-2 text-left font-medium">Employee</th>
                  <th className="px-3 py-2 text-left font-medium">Day</th>
                  <th className="px-3 py-2 text-left font-medium">Times</th>
                  <th className="px-3 py-2 text-right font-medium">Break</th>
                  <th className="px-3 py-2 text-right font-medium">Hours</th>
                  <th className="px-4 py-2 text-left font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry, index) => (
                  <tr
                    key={`${entry.userId}-${entry.workDate}-${index}`}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-2">{entry.displayName}</td>
                    <td className="px-3 py-2">
                      {weekdayShort(entry.workDate)} {formatDayLabel(entry.workDate).slice(4)}
                    </td>
                    <td className="nums px-3 py-2">
                      {formatTimeRange(entry.startTime, entry.endTime)}
                    </td>
                    <td className="nums px-3 py-2 text-right text-muted">{entry.breakMinutes}m</td>
                    <td className="nums px-3 py-2 text-right font-medium">
                      {formatHours(entry.workedMinutes)}
                    </td>
                    <td className="px-4 py-2 text-muted">{entry.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!settled && !reopened && (
        <Card title="Your decision">
          <div className="space-y-3 p-4">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-muted">
                Note (required if sending back)
              </span>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-accent"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                loading={busy === "approved"}
                onClick={() => void decide("approved")}
              >
                Approve
              </Button>
              <Button loading={busy === "rejected"} onClick={() => void decide("rejected")}>
                Send back for changes
              </Button>
            </div>
          </div>
        </Card>
      )}

      <p className="pb-6 text-xs text-muted">
        This link is unique to this pay period and expires on{" "}
        {new Date(data.expiresAt).toLocaleDateString("en-AU")}.
      </p>
    </main>
  );
}
