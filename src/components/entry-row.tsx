"use client";

import { useEffect, useState } from "react";
import { formatDayLabel } from "@/lib/dates";
import { crossesMidnight, formatHours, workedMinutes } from "@/lib/shift-time";
import type { TimesheetEntryDto } from "@/lib/types";

const CELL = "rounded-xl border border-border bg-surface px-2 py-1.5 outline-none transition focus:border-accent";

/**
 * One timesheet line. Edits are local until the field is committed, then saved;
 * a failed save reverts to the server value so the grid never shows a number
 * payroll will not receive.
 */
export function EntryRow({
  entry,
  locked,
  onSave,
  onDelete,
}: {
  entry: TimesheetEntryDto;
  locked: boolean;
  onSave: (patch: Partial<TimesheetEntryDto>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [startTime, setStartTime] = useState(entry.startTime);
  const [endTime, setEndTime] = useState(entry.endTime);
  const [breakMinutes, setBreakMinutes] = useState(entry.breakMinutes);
  const [note, setNote] = useState(entry.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStartTime(entry.startTime);
    setEndTime(entry.endTime);
    setBreakMinutes(entry.breakMinutes);
    setNote(entry.note ?? "");
  }, [entry]);

  const minutes = workedMinutes({ startTime, endTime, breakMinutes });
  const variance = entry.rosteredMinutes === null ? null : minutes - entry.rosteredMinutes;

  const commit = async (patch: Partial<TimesheetEntryDto>) => {
    setSaving(true);
    setError(null);
    try {
      await onSave(patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setStartTime(entry.startTime);
      setEndTime(entry.endTime);
      setBreakMinutes(entry.breakMinutes);
      setNote(entry.note ?? "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-2 text-sm">
        {formatDayLabel(entry.workDate)}
        {crossesMidnight(startTime, endTime) && (
          <span className="ml-1 text-xs text-muted">→ next day</span>
        )}
        {error && <span className="block text-xs text-bad">{error}</span>}
      </td>

      <td className="px-1 py-2">
        <input
          type="time"
          aria-label="Start time"
          disabled={locked}
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          onBlur={() => startTime !== entry.startTime && void commit({ startTime })}
          className={CELL}
        />
      </td>

      <td className="px-1 py-2">
        <input
          type="time"
          aria-label="Finish time"
          disabled={locked}
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          onBlur={() => endTime !== entry.endTime && void commit({ endTime })}
          className={CELL}
        />
      </td>

      <td className="px-1 py-2">
        <input
          type="number"
          aria-label="Unpaid break in minutes"
          min={0}
          max={720}
          step={5}
          disabled={locked}
          value={breakMinutes}
          onChange={(e) => setBreakMinutes(Number(e.target.value) || 0)}
          onBlur={() => breakMinutes !== entry.breakMinutes && void commit({ breakMinutes })}
          className={`${CELL} w-20`}
        />
      </td>

      <td className="nums px-3 py-2 text-right text-sm font-medium">{formatHours(minutes)}</td>

      <td className="nums px-3 py-2 text-right text-sm text-muted">
        {entry.rosteredMinutes === null ? "—" : formatHours(entry.rosteredMinutes)}
      </td>

      <td className="nums px-3 py-2 text-right text-sm">
        {variance === null || variance === 0 ? (
          <span className="text-muted">0.00</span>
        ) : (
          <span className={variance > 0 ? "text-warn" : "text-good"}>
            {variance > 0 ? "+" : ""}
            {formatHours(variance)}
          </span>
        )}
      </td>

      <td className="px-1 py-2">
        <input
          type="text"
          aria-label="Note"
          placeholder="Note"
          disabled={locked}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (entry.note ?? "") && void commit({ note: note || null })}
          className={`${CELL} w-full min-w-32`}
        />
      </td>

      <td className="px-2 py-2 text-right">
        {!locked && (
          <button
            type="button"
            aria-label="Remove this line"
            disabled={saving}
            onClick={() => void onDelete()}
            className="rounded-full px-2 py-1 text-sm text-muted transition hover:bg-bad-soft hover:text-bad"
          >
            ✕
          </button>
        )}
      </td>
    </tr>
  );
}
