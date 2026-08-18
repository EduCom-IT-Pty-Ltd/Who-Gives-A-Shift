"use client";

import { formatRange } from "@/lib/dates";
import { shiftPayPeriod, type PayPeriodRange } from "@/lib/pay-period";
import { Button } from "./ui";

/** Thursday-to-Wednesday paging. Always moves a whole cycle at a time. */
export function PeriodNav({
  range,
  onChange,
  onToday,
  right,
}: {
  range: PayPeriodRange;
  onChange: (next: PayPeriodRange) => void;
  onToday: () => void;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Button aria-label="Previous pay period" onClick={() => onChange(shiftPayPeriod(range, -1))}>
          ←
        </Button>
        <Button aria-label="Next pay period" onClick={() => onChange(shiftPayPeriod(range, 1))}>
          →
        </Button>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{formatRange(range.startDate, range.endDate)}</p>
        <p className="text-xs text-muted">Pay cycle · Thursday to Wednesday</p>
      </div>
      <Button variant="ghost" onClick={onToday}>
        This cycle
      </Button>
      <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div>
    </div>
  );
}
