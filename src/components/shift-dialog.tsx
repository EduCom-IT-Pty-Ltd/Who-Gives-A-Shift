"use client";

import { useEffect, useState } from "react";
import { Dialog } from "./dialog";
import { Button, Field, Note } from "./ui";
import { formatDayLabel } from "@/lib/dates";
import { crossesMidnight, formatDuration, workedMinutes } from "@/lib/shift-time";
import type { MemberDto, ShiftDto } from "@/lib/types";

export interface ShiftDraft {
  userId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  label: string;
  notes: string;
}

const DEFAULTS = { startTime: "09:00", endTime: "17:00", breakMinutes: 30 };

export function ShiftDialog({
  open,
  onClose,
  members,
  existing,
  seed,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  members: MemberDto[];
  existing: ShiftDto | null;
  seed: { userId: string; workDate: string } | null;
  onSave: (draft: ShiftDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<ShiftDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (existing) {
      setDraft({
        userId: existing.userId,
        workDate: existing.workDate,
        startTime: existing.startTime,
        endTime: existing.endTime,
        breakMinutes: existing.breakMinutes,
        label: existing.label ?? "",
        notes: existing.notes ?? "",
      });
    } else if (seed) {
      setDraft({ ...seed, ...DEFAULTS, label: "", notes: "" });
    }
  }, [open, existing, seed]);

  if (!draft) return null;

  const minutes = workedMinutes(draft);
  const overnight = crossesMidnight(draft.startTime, draft.endTime);
  const update = <K extends keyof ShiftDraft>(key: K, value: ShiftDraft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(draft);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the shift");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!onDelete) return;
    setBusy(true);
    try {
      await onDelete();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the shift");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${existing ? "Edit" : "Add"} shift · ${formatDayLabel(draft.workDate)}`}
      footer={
        <>
          {existing && onDelete && (
            <Button variant="danger" onClick={() => void remove()} disabled={busy}>
              Delete
            </Button>
          )}
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {existing ? "Save changes" : "Add shift"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Note tone="bad">{error}</Note>}

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-muted">Team member</span>
          <select
            value={draft.userId}
            onChange={(e) => update("userId", e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-accent"
          >
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-3 gap-2">
          <Field
            label="Start"
            type="time"
            value={draft.startTime}
            onChange={(e) => update("startTime", e.target.value)}
          />
          <Field
            label="Finish"
            type="time"
            value={draft.endTime}
            onChange={(e) => update("endTime", e.target.value)}
          />
          <Field
            label="Break (min)"
            type="number"
            min={0}
            max={720}
            step={5}
            value={draft.breakMinutes}
            onChange={(e) => update("breakMinutes", Number(e.target.value) || 0)}
          />
        </div>

        <p className="text-xs text-muted">
          Paid time: <strong className="nums text-ink">{formatDuration(minutes)}</strong>
          {overnight && " · finishes the next day"}
        </p>

        <Field
          label="Label (optional)"
          placeholder="Open, Close, Floor…"
          value={draft.label}
          onChange={(e) => update("label", e.target.value)}
        />
        <Field
          label="Notes (optional)"
          value={draft.notes}
          onChange={(e) => update("notes", e.target.value)}
        />
      </div>
    </Dialog>
  );
}
