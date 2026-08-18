"use client";

import { useMemo, useState } from "react";
import { AppShell, useMe } from "@/components/app-shell";
import { PeriodNav } from "@/components/period-nav";
import { StorePicker } from "@/components/store-picker";
import { ShiftDialog, type ShiftDraft } from "@/components/shift-dialog";
import { AddMemberDialog } from "@/components/add-member-dialog";
import { RemoveMemberDialog } from "@/components/remove-member-dialog";
import { StandardHoursDialog } from "@/components/standard-hours-dialog";
import { Badge, Button, Card, Empty, Loading, Note } from "@/components/ui";
import { jsonBody, patchBody, useApi } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";
import { formatDayLabel, todayInZone, weekdayShort } from "@/lib/dates";
import { currentPayPeriod, type PayPeriodRange } from "@/lib/pay-period";
import { formatDuration, formatTimeRange } from "@/lib/shift-time";
import { summariseStandardWeek } from "@/lib/standard-week";
import type { MemberDto, RosterResponse, ShiftDto } from "@/lib/types";

function RosterBoard() {
  const me = useMe();
  const api = useApi();

  const stores = me.stores;
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const store = stores.find((s) => s.id === storeId) ?? stores[0];
  const timezone = store?.timezone ?? "Australia/Sydney";

  const [range, setRange] = useState<PayPeriodRange>(() => currentPayPeriod(timezone));
  const [editing, setEditing] = useState<ShiftDto | null>(null);
  const [seed, setSeed] = useState<{ userId: string; workDate: string } | null>(null);
  const [addingMember, setAddingMember] = useState(false);
  const [removingMember, setRemovingMember] = useState<MemberDto | null>(null);
  const [hoursFor, setHoursFor] = useState<MemberDto | null>(null);
  const [filling, setFilling] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const roster = useAsync<RosterResponse | null>(
    async () =>
      storeId ? api<RosterResponse>(`/api/stores/${storeId}/roster?start=${range.startDate}`) : null,
    [storeId, range.startDate],
  );

  const byCell = useMemo(() => {
    const map = new Map<string, ShiftDto[]>();
    for (const shift of roster.data?.shifts ?? []) {
      const key = `${shift.userId}|${shift.workDate}`;
      const list = map.get(key);
      if (list) list.push(shift);
      else map.set(key, [shift]);
    }
    return map;
  }, [roster.data]);

  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const shift of roster.data?.shifts ?? []) {
      map.set(shift.userId, (map.get(shift.userId) ?? 0) + shift.workedMinutes);
    }
    return map;
  }, [roster.data]);

  const shiftCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const shift of roster.data?.shifts ?? []) {
      map.set(shift.userId, (map.get(shift.userId) ?? 0) + 1);
    }
    return map;
  }, [roster.data]);

  const draftCount = (roster.data?.shifts ?? []).filter((s) => s.status === "draft").length;
  const today = todayInZone(timezone);

  const saveShift = async (draft: ShiftDraft) => {
    const payload = {
      userId: draft.userId,
      workDate: draft.workDate,
      startTime: draft.startTime,
      endTime: draft.endTime,
      breakMinutes: draft.breakMinutes,
      label: draft.label || null,
      notes: draft.notes || null,
    };
    if (editing) await api(`/api/shifts/${editing.id}`, patchBody(payload));
    else await api(`/api/stores/${storeId}/shifts`, jsonBody(payload));
    roster.reload();
  };

  const deleteShift = async () => {
    if (!editing) return;
    await api(`/api/shifts/${editing.id}`, { method: "DELETE" });
    roster.reload();
  };

  const fillFromStandardHours = async () => {
    setFilling(true);
    setFlash(null);
    try {
      const result = await api<{
        created: number;
        skipped: number;
        membersWithoutPattern: number;
      }>(
        `/api/stores/${storeId}/roster/apply-standard-hours`,
        jsonBody({ startDate: range.startDate }),
      );

      const parts = [
        result.created
          ? `Added ${result.created} draft shift${result.created === 1 ? "" : "s"}.`
          : "No new shifts to add.",
      ];
      if (result.skipped) parts.push(`${result.skipped} skipped — those days already had shifts.`);
      if (result.membersWithoutPattern) {
        parts.push(
          `${result.membersWithoutPattern} team member${
            result.membersWithoutPattern === 1 ? " has" : "s have"
          } no standard hours set.`,
        );
      }
      setFlash(parts.join(" "));
      roster.reload();
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Could not fill from standard hours");
    } finally {
      setFilling(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    setFlash(null);
    try {
      const result = await api<{ published: number }>(
        `/api/stores/${storeId}/roster/publish`,
        jsonBody({ startDate: range.startDate }),
      );
      setFlash(
        result.published
          ? `Published ${result.published} shift${result.published === 1 ? "" : "s"}. Staff can see them now.`
          : "Everything in this cycle was already published.",
      );
      roster.reload();
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Could not publish the roster");
    } finally {
      setPublishing(false);
    }
  };

  if (!store) {
    return <Note tone="warn">You are not linked to a store yet. Ask an administrator to add you.</Note>;
  }

  if (!store.canManage) {
    return (
      <Note tone="warn">
        Only store managers can build rosters. Your published shifts are on the My shifts page.
      </Note>
    );
  }

  const members = roster.data?.members.filter((m) => m.active) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Roster</h1>
          <p className="text-sm text-muted">Plan the cycle, then publish it to your team.</p>
        </div>
        <StorePicker stores={stores} value={storeId} onChange={setStoreId} />
      </div>

      <PeriodNav
        range={range}
        onChange={setRange}
        onToday={() => setRange(currentPayPeriod(timezone))}
        right={
          <>
            <Button onClick={() => setAddingMember(true)}>Add team member</Button>
            <Button loading={filling} onClick={() => void fillFromStandardHours()}>
              Fill from standard hours
            </Button>
            <Button
              variant="primary"
              loading={publishing}
              disabled={!draftCount}
              onClick={() => void publish()}
            >
              {draftCount ? `Publish ${draftCount} draft${draftCount === 1 ? "" : "s"}` : "All published"}
            </Button>
          </>
        }
      />

      {flash && <Note tone="good">{flash}</Note>}
      {roster.error && <Note tone="bad">{roster.error}</Note>}

      <Card>
        {roster.loading ? (
          <Loading label="Loading roster…" />
        ) : !members.length ? (
          <Empty>No one is on this store&rsquo;s team yet. Add someone to start rostering.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="sticky left-0 z-[1] bg-surface px-3 py-2 text-left text-xs font-medium text-muted">
                    Team member
                  </th>
                  {(roster.data?.days ?? []).map((day) => (
                    <th
                      key={day}
                      className={`px-2 py-2 text-left text-xs font-medium ${
                        day === today ? "text-accent" : "text-muted"
                      }`}
                    >
                      {weekdayShort(day)}{" "}
                      <span className="font-normal">{day.slice(8)}</span>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted">Total</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.userId} className="border-b border-border last:border-0">
                    <th
                      scope="row"
                      className="sticky left-0 z-[1] max-w-[12rem] bg-surface px-3 py-2 text-left align-top font-medium"
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <span className="min-w-0">
                          <span className="block truncate">{member.displayName}</span>
                          {member.role === "manager" && <Badge tone="accent">Manager</Badge>}
                          <button
                            type="button"
                            onClick={() => setHoursFor(member)}
                            className="mt-0.5 block max-w-full truncate rounded text-left text-xs font-normal text-muted underline decoration-dotted underline-offset-2 transition hover:text-accent"
                          >
                            {summariseStandardWeek(member.standardShifts) ?? "Set standard hours"}
                          </button>
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${member.displayName} from ${store.name}`}
                          title="Remove from roster"
                          onClick={() => setRemovingMember(member)}
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-xs font-normal text-muted transition hover:bg-bad-soft hover:text-bad"
                        >
                          ✕
                        </button>
                      </div>
                    </th>

                    {(roster.data?.days ?? []).map((day) => {
                      const cell = byCell.get(`${member.userId}|${day}`) ?? [];
                      return (
                        <td key={day} className="px-1 py-1 align-top">
                          <div className="flex flex-col gap-1">
                            {cell.map((shift) => (
                              <button
                                key={shift.id}
                                type="button"
                                onClick={() => {
                                  setSeed(null);
                                  setEditing(shift);
                                }}
                                className={`rounded-xl border px-2 py-1.5 text-left text-xs transition hover:border-accent ${
                                  shift.status === "published"
                                    ? "border-transparent bg-accent-soft"
                                    : "border-dashed border-border-strong bg-surface-2"
                                }`}
                              >
                                <span className="nums block font-medium">
                                  {formatTimeRange(shift.startTime, shift.endTime)}
                                </span>
                                <span className="block text-muted">
                                  {formatDuration(shift.workedMinutes)}
                                  {shift.label ? ` · ${shift.label}` : ""}
                                </span>
                              </button>
                            ))}
                            <button
                              type="button"
                              aria-label={`Add shift for ${member.displayName} on ${formatDayLabel(day)}`}
                              onClick={() => {
                                setEditing(null);
                                setSeed({ userId: member.userId, workDate: day });
                              }}
                              className="rounded-xl border border-dashed border-border px-2 py-1 text-xs text-muted transition hover:border-accent hover:text-accent"
                            >
                              +
                            </button>
                          </div>
                        </td>
                      );
                    })}

                    <td className="nums px-3 py-2 text-right align-top font-medium">
                      {formatDuration(totals.get(member.userId) ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-muted">
        Dashed shifts are drafts and only you can see them. Solid shifts are published to staff.
      </p>

      <ShiftDialog
        open={Boolean(editing || seed)}
        onClose={() => {
          setEditing(null);
          setSeed(null);
        }}
        members={members}
        existing={editing}
        seed={seed}
        onSave={saveShift}
        onDelete={editing ? deleteShift : undefined}
      />

      <AddMemberDialog
        open={addingMember}
        onClose={() => setAddingMember(false)}
        storeId={storeId}
        onAdded={roster.reload}
      />

      <StandardHoursDialog
        open={Boolean(hoursFor)}
        onClose={() => setHoursFor(null)}
        storeId={storeId}
        member={hoursFor}
        onSaved={roster.reload}
      />

      <RemoveMemberDialog
        open={Boolean(removingMember)}
        onClose={() => setRemovingMember(null)}
        storeId={storeId}
        storeName={store.name}
        member={removingMember}
        shiftCount={removingMember ? (shiftCounts.get(removingMember.userId) ?? 0) : 0}
        onRemoved={roster.reload}
      />
    </div>
  );
}

export default function RosterPage() {
  return (
    <AppShell>
      <RosterBoard />
    </AppShell>
  );
}
