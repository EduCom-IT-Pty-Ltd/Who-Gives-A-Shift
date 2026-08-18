"use client";

import { useMemo, useState } from "react";
import { AppShell, useMe } from "@/components/app-shell";
import { PeriodNav } from "@/components/period-nav";
import { StorePicker } from "@/components/store-picker";
import { EntryRow } from "@/components/entry-row";
import { SubmitDialog } from "@/components/submit-dialog";
import { ShiftDialog, type ShiftDraft } from "@/components/shift-dialog";
import { Badge, Button, Card, Loading, Note } from "@/components/ui";
import { jsonBody, patchBody, useApi } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";
import { currentPayPeriod, type PayPeriodRange } from "@/lib/pay-period";
import { formatHours } from "@/lib/shift-time";
import type { StaffTotal, TimesheetEntryDto, TimesheetResponse } from "@/lib/types";

const STATUS_TONE = {
  open: "muted",
  submitted: "accent",
  approved: "good",
  rejected: "bad",
} as const;

const STATUS_LABEL = {
  open: "Open",
  submitted: "Awaiting review",
  approved: "Approved",
  rejected: "Sent back",
} as const;

function Timesheets() {
  const me = useMe();
  const api = useApi();

  const stores = me.stores;
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const store = stores.find((s) => s.id === storeId) ?? stores[0];
  const timezone = store?.timezone ?? "Australia/Sydney";

  const [range, setRange] = useState<PayPeriodRange>(() => currentPayPeriod(timezone));
  const [submitting, setSubmitting] = useState(false);
  const [addingFor, setAddingFor] = useState<{ userId: string; workDate: string } | null>(null);
  const [flash, setFlash] = useState<{ tone: "good" | "warn" | "bad"; text: string } | null>(null);
  const [preparing, setPreparing] = useState(false);

  const sheet = useAsync<TimesheetResponse | null>(
    async () =>
      storeId
        ? api<TimesheetResponse>(`/api/stores/${storeId}/timesheet?start=${range.startDate}`)
        : null,
    [storeId, range.startDate],
  );

  /**
   * Splice a saved line back into place rather than refetching the sheet. A
   * refetch would reset every other input, discarding a value the manager was
   * part-way through typing in another cell.
   */
  const replaceEntry = (updated: TimesheetEntryDto) => {
    const current = sheet.data;
    if (!current) return;
    sheet.setData({
      ...current,
      entries: current.entries.map((e) => (e.id === updated.id ? updated : e)),
    });
  };

  const dropEntry = (entryId: string) => {
    const current = sheet.data;
    if (!current) return;
    sheet.setData({ ...current, entries: current.entries.filter((e) => e.id !== entryId) });
  };

  const data = sheet.data;
  const locked = data?.locked ?? false;

  const grouped = useMemo(() => {
    const byUser = new Map<string, TimesheetEntryDto[]>();
    for (const entry of data?.entries ?? []) {
      const list = byUser.get(entry.userId);
      if (list) list.push(entry);
      else byUser.set(entry.userId, [entry]);
    }
    const names = new Map((data?.members ?? []).map((m) => [m.userId, m.displayName]));
    return [...byUser.entries()]
      .map(([userId, entries]) => ({
        userId,
        displayName: names.get(userId) ?? "Unknown",
        entries,
        workedMinutes: entries.reduce((sum, e) => sum + e.workedMinutes, 0),
        rosteredMinutes: entries.reduce((sum, e) => sum + (e.rosteredMinutes ?? 0), 0),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [data]);

  const totalMinutes = grouped.reduce((sum, g) => sum + g.workedMinutes, 0);

  const staffTotals: StaffTotal[] = grouped.map((g) => ({
    userId: g.userId,
    displayName: g.displayName,
    upn: "",
    workedMinutes: g.workedMinutes,
    rosteredMinutes: g.rosteredMinutes,
    varianceMinutes: g.workedMinutes - g.rosteredMinutes,
    days: g.entries.length,
  }));

  const prepare = async () => {
    setPreparing(true);
    setFlash(null);
    try {
      const next = await api<TimesheetResponse>(
        `/api/stores/${storeId}/timesheet/prepare`,
        jsonBody({ startDate: range.startDate }),
      );
      sheet.setData(next);
      if (!next.entries.length) {
        setFlash({
          tone: "warn",
          text: "There are no published shifts in this cycle. Publish the roster first, or add hours by hand.",
        });
      }
    } catch (e) {
      setFlash({ tone: "bad", text: e instanceof Error ? e.message : "Could not load the roster" });
    } finally {
      setPreparing(false);
    }
  };

  const submit = async (note: string | null) => {
    if (!data?.period.id) throw new Error("Open the period before submitting");
    const result = await api<{ emailed: boolean; emailError: string | null; reviewerEmail: string }>(
      `/api/pay-periods/${data.period.id}/submit`,
      jsonBody({ note }),
    );
    sheet.reload();
    setFlash(
      result.emailed
        ? { tone: "good", text: `Submitted and emailed to ${result.reviewerEmail}.` }
        : {
            tone: "warn",
            text: `Locked and recorded, but the email did not send: ${result.emailError}. Use Re-send once that is fixed.`,
          },
    );
  };

  const resend = async () => {
    if (!data?.period.id) return;
    setFlash(null);
    try {
      const result = await api<{ emailed: boolean; emailError: string | null; reviewerEmail: string }>(
        `/api/pay-periods/${data.period.id}/submit`,
        jsonBody({ resend: true }),
      );
      setFlash(
        result.emailed
          ? { tone: "good", text: `Re-sent to ${result.reviewerEmail}.` }
          : { tone: "bad", text: result.emailError ?? "The email did not send." },
      );
    } catch (e) {
      setFlash({ tone: "bad", text: e instanceof Error ? e.message : "Could not re-send" });
    }
  };

  const addEntry = async (draft: ShiftDraft) => {
    if (!data?.period.id) throw new Error("Open the period first");
    await api(
      `/api/pay-periods/${data.period.id}/entries`,
      jsonBody({
        userId: draft.userId,
        workDate: draft.workDate,
        startTime: draft.startTime,
        endTime: draft.endTime,
        breakMinutes: draft.breakMinutes,
        note: draft.notes || null,
      }),
    );
    sheet.reload();
  };

  if (!store) {
    return <Note tone="warn">You are not linked to a store yet.</Note>;
  }
  if (!store.canManage) {
    return <Note tone="warn">Only store managers can review and submit hours.</Note>;
  }

  const status = data?.period.status ?? "open";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Hours &amp; submission</h1>
          <p className="text-sm text-muted">
            Correct the actual hours worked, then send the cycle for review.
          </p>
        </div>
        <StorePicker stores={stores} value={storeId} onChange={setStoreId} />
      </div>

      <PeriodNav
        range={range}
        onChange={setRange}
        onToday={() => setRange(currentPayPeriod(timezone))}
        right={
          <>
            <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
            {status === "submitted" && (
              <Button onClick={() => void resend()}>Re-send email</Button>
            )}
            <Button
              variant="primary"
              disabled={!data?.canSubmit}
              onClick={() => setSubmitting(true)}
            >
              Submit for review
            </Button>
          </>
        }
      />

      {flash && <Note tone={flash.tone}>{flash.text}</Note>}
      {sheet.error && <Note tone="bad">{sheet.error}</Note>}

      {data && !data.periodComplete && status === "open" && (
        <Note tone="warn">
          This cycle is still running. You can review hours now, but it can only be submitted from
          Wednesday {range.endDate}.
        </Note>
      )}

      {data?.period.reviewNote && (
        <Note tone={status === "approved" ? "good" : "warn"}>
          <strong>Reviewer:</strong> {data.period.reviewNote}
        </Note>
      )}

      {data?.period.submittedAt && (
        <p className="text-xs text-muted">
          Submitted by {data.period.submittedByName ?? "a manager"} on{" "}
          {new Date(data.period.submittedAt).toLocaleString("en-AU")} to{" "}
          {data.period.reviewerEmail}.
        </p>
      )}

      {sheet.loading ? (
        <Card>
          <Loading label="Loading hours…" />
        </Card>
      ) : !grouped.length ? (
        <Card>
          <div className="space-y-4 px-4 py-10 text-center">
            <p className="text-sm text-muted">
              Nothing to review yet. Pull in the published roster to get a starting point.
            </p>
            <Button variant="primary" loading={preparing} onClick={() => void prepare()}>
              Load hours from the roster
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => {
            const variance = group.workedMinutes - group.rosteredMinutes;
            return (
              <Card
                key={group.userId}
                title={group.displayName}
                action={
                  <div className="flex items-center gap-3 text-sm">
                    <span className="nums text-muted">
                      rostered {formatHours(group.rosteredMinutes)}
                    </span>
                    <span className="nums font-semibold">
                      worked {formatHours(group.workedMinutes)}
                    </span>
                    {variance !== 0 && (
                      <Badge tone={variance > 0 ? "warn" : "good"}>
                        {variance > 0 ? "+" : ""}
                        {formatHours(variance)}
                      </Badge>
                    )}
                    {!locked && (
                      <Button
                        onClick={() =>
                          setAddingFor({ userId: group.userId, workDate: range.startDate })
                        }
                      >
                        Add a day
                      </Button>
                    )}
                  </div>
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[46rem] border-collapse">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted">
                        <th className="px-3 py-2 text-left font-medium">Day</th>
                        <th className="px-1 py-2 text-left font-medium">Start</th>
                        <th className="px-1 py-2 text-left font-medium">Finish</th>
                        <th className="px-1 py-2 text-left font-medium">Break</th>
                        <th className="px-3 py-2 text-right font-medium">Worked</th>
                        <th className="px-3 py-2 text-right font-medium">Rostered</th>
                        <th className="px-3 py-2 text-right font-medium">Variance</th>
                        <th className="px-1 py-2 text-left font-medium">Note</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {group.entries.map((entry) => (
                        <EntryRow
                          key={entry.id}
                          entry={entry}
                          locked={locked}
                          onSave={async (patch) => {
                            replaceEntry(
                              await api<TimesheetEntryDto>(
                                `/api/timesheet-entries/${entry.id}`,
                                patchBody(patch),
                              ),
                            );
                          }}
                          onDelete={async () => {
                            await api(`/api/timesheet-entries/${entry.id}`, { method: "DELETE" });
                            dropEntry(entry.id);
                          }}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}

          <Card>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-semibold">
                {grouped.length} people · {data?.entries.length} shifts
              </span>
              <span className="nums text-sm font-semibold">
                {formatHours(totalMinutes)} hours total
              </span>
            </div>
          </Card>
        </div>
      )}

      <SubmitDialog
        open={submitting}
        onClose={() => setSubmitting(false)}
        reviewerEmail={data?.period.reviewerEmail ?? "ahaworth@educomit.com.au"}
        startDate={range.startDate}
        endDate={range.endDate}
        totals={staffTotals}
        totalMinutes={totalMinutes}
        onSubmit={submit}
      />

      <ShiftDialog
        open={Boolean(addingFor)}
        onClose={() => setAddingFor(null)}
        members={data?.members ?? []}
        existing={null}
        seed={addingFor}
        onSave={addEntry}
      />
    </div>
  );
}

export default function TimesheetsPage() {
  return (
    <AppShell>
      <Timesheets />
    </AppShell>
  );
}
