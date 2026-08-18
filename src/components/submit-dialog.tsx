"use client";

import { useState } from "react";
import { Dialog } from "./dialog";
import { Button, Note } from "./ui";
import { formatRange } from "@/lib/dates";
import { formatHours } from "@/lib/shift-time";
import type { StaffTotal } from "@/lib/types";

export function SubmitDialog({
  open,
  onClose,
  reviewerEmail,
  startDate,
  endDate,
  totals,
  totalMinutes,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  reviewerEmail: string;
  startDate: string;
  endDate: string;
  totals: StaffTotal[];
  totalMinutes: number;
  onSubmit: (note: string | null) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(note.trim() || null);
      setNote("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit the timesheet");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Submit timesheet for review"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            Submit and send
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        {error && <Note tone="bad">{error}</Note>}

        <p>
          Sending <strong>{totals.length}</strong> people and{" "}
          <strong className="nums">{formatHours(totalMinutes)}</strong> hours for{" "}
          {formatRange(startDate, endDate)} to <strong>{reviewerEmail}</strong>.
        </p>
        <p className="text-muted">
          It goes from your own mailbox, so you will find it in Sent Items and any reply comes
          back to you.
        </p>

        <Note tone="warn">
          This locks the pay period. Nobody can change the roster or hours for these dates
          afterwards unless the reviewer sends it back.
        </Note>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">
            Note for the reviewer (optional)
          </span>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything unusual this cycle — public holiday rates, a sick day, unrostered overtime…"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 outline-none transition focus:border-accent"
          />
        </label>
      </div>
    </Dialog>
  );
}
