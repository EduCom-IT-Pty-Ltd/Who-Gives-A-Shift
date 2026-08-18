"use client";

import { useEffect, useState } from "react";
import { Dialog } from "./dialog";
import { Button, Note } from "./ui";
import { useApi } from "@/lib/api-client";
import { formatDuration, workedMinutes } from "@/lib/shift-time";
import {
  PERIOD_WEEKDAYS,
  STANDARD_WEEK_PRESETS,
  weekdayLabel,
  type StandardWeekPreset,
} from "@/lib/standard-week";
import type { MemberDto, StandardShiftDto } from "@/lib/types";

interface Slot {
  key: string;
  weekday: number;
  startTime: string;
  endTime: string;
  breakMinutes: number;
}

const DEFAULT_SLOT = { startTime: "09:00", endTime: "17:00", breakMinutes: 30 };

let counter = 0;
const nextKey = () => `slot-${(counter += 1)}`;

const toSlots = (shifts: StandardShiftDto[]): Slot[] =>
  shifts.map((s) => ({
    key: nextKey(),
    weekday: s.weekday,
    startTime: s.startTime,
    endTime: s.endTime,
    breakMinutes: s.breakMinutes,
  }));

/**
 * Defines the week a person works every cycle. Saving replaces the whole
 * pattern, so the dialog always holds the complete week rather than a diff.
 */
export function StandardHoursDialog({
  open,
  onClose,
  storeId,
  member,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  storeId: string;
  member: MemberDto | null;
  onSaved: () => void;
}) {
  const api = useApi();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !member) return;
    setError(null);
    setSlots(toSlots(member.standardShifts));
  }, [open, member]);

  if (!member) return null;

  const update = (key: string, patch: Partial<Slot>) =>
    setSlots((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const addSlot = (weekday: number) =>
    setSlots((all) => [...all, { key: nextKey(), weekday, ...DEFAULT_SLOT }]);

  const removeSlot = (key: string) => setSlots((all) => all.filter((s) => s.key !== key));

  /** Presets replace the whole week — nothing is written until Save. */
  const applyPreset = (preset: StandardWeekPreset) =>
    setSlots(preset.slots.map((slot) => ({ key: nextKey(), ...slot })));

  const invalid = slots.find((s) => workedMinutes(s) <= 0);
  const weeklyMinutes = slots.reduce((total, s) => total + workedMinutes(s), 0);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/stores/${storeId}/members/${member.id}/standard-hours`, {
        method: "PUT",
        body: JSON.stringify({
          shifts: slots.map(({ weekday, startTime, endTime, breakMinutes }) => ({
            weekday,
            startTime,
            endTime,
            breakMinutes,
          })),
        }),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save these standard hours");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Standard hours · ${member.displayName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={Boolean(invalid)}
            onClick={() => void save()}
          >
            Save standard hours
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          The week this person normally works. Use{" "}
          <span className="font-semibold">Fill from standard hours</span> on the roster to stamp it
          onto a cycle as drafts.
        </p>

        <div className="rounded-xl bg-surface-2 px-3 py-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Start from</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {STANDARD_WEEK_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                title={preset.hint}
                onClick={() => applyPreset(preset)}
                className="rounded-full border border-border-strong bg-surface px-3 py-1 text-sm font-bold transition hover:border-accent hover:text-accent"
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSlots([])}
              className="rounded-full px-3 py-1 text-sm font-bold text-muted transition hover:bg-bad-soft hover:text-bad"
            >
              Clear week
            </button>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {STANDARD_WEEK_PRESETS[0].hint}. Replaces whatever is below — nothing is saved until you
            press Save.
          </p>
        </div>

        {error && <Note tone="bad">{error}</Note>}
        {invalid && <Note tone="bad">The break is longer than the shift itself.</Note>}

        <div className="space-y-2">
          {PERIOD_WEEKDAYS.map((weekday) => {
            const forDay = slots.filter((s) => s.weekday === weekday);
            return (
              <div key={weekday} className="rounded-xl border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{weekdayLabel(weekday)}</span>
                  <button
                    type="button"
                    onClick={() => addSlot(weekday)}
                    className="rounded-full px-2 py-0.5 text-xs font-bold text-muted transition hover:bg-accent-soft hover:text-accent"
                  >
                    + Add
                  </button>
                </div>

                {!forDay.length ? (
                  <p className="text-xs text-muted">Not working</p>
                ) : (
                  <div className="mt-1.5 space-y-1.5">
                    {forDay.map((slot) => (
                      <div key={slot.key} className="flex flex-wrap items-center gap-1.5 text-sm">
                        <input
                          type="time"
                          aria-label={`${weekdayLabel(weekday)} start time`}
                          value={slot.startTime}
                          onChange={(e) => update(slot.key, { startTime: e.target.value })}
                          className="rounded-lg border border-border bg-surface px-2 py-1 outline-none transition focus:border-accent"
                        />
                        <span className="text-muted">–</span>
                        <input
                          type="time"
                          aria-label={`${weekdayLabel(weekday)} end time`}
                          value={slot.endTime}
                          onChange={(e) => update(slot.key, { endTime: e.target.value })}
                          className="rounded-lg border border-border bg-surface px-2 py-1 outline-none transition focus:border-accent"
                        />
                        <label className="flex items-center gap-1 text-xs text-muted">
                          break
                          <input
                            type="number"
                            min={0}
                            max={720}
                            aria-label={`${weekdayLabel(weekday)} break minutes`}
                            value={slot.breakMinutes}
                            onChange={(e) =>
                              update(slot.key, { breakMinutes: Number(e.target.value) || 0 })
                            }
                            className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-ink outline-none transition focus:border-accent"
                          />
                          min
                        </label>
                        <span className="nums text-xs text-muted">
                          {formatDuration(Math.max(0, workedMinutes(slot)))}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove this ${weekdayLabel(weekday)} shift`}
                          onClick={() => removeSlot(slot.key)}
                          className="ml-auto rounded-full px-1.5 py-0.5 text-xs text-muted transition hover:bg-bad-soft hover:text-bad"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-sm">
          <span className="text-muted">Weekly total</span>{" "}
          <span className="nums font-semibold">{formatDuration(weeklyMinutes)}</span>
        </p>
      </div>
    </Dialog>
  );
}
