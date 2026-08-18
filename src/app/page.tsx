"use client";

import Link from "next/link";
import { AppShell, useMe } from "@/components/app-shell";
import { Badge, Card, Empty, Loading, Note } from "@/components/ui";
import { useApi } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";
import { formatDayLabel, todayInZone } from "@/lib/dates";
import { formatDuration, formatTimeRange } from "@/lib/shift-time";

interface MyShift {
  id: string;
  storeName: string;
  storeCode: string;
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  label: string | null;
  notes: string | null;
  workedMinutes: number;
}

function MyShifts() {
  const me = useMe();
  const api = useApi();
  const shifts = useAsync<MyShift[]>(() => api<MyShift[]>("/api/my-shifts"), []);
  const managed = me.stores.filter((s) => s.canManage);
  const today = todayInZone(me.stores[0]?.timezone ?? "Australia/Sydney");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Hello, {me.user.displayName.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted">Your published shifts across every store.</p>
      </div>

      {managed.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href="/roster"
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-bold transition hover:border-accent hover:bg-surface-2"
          >
            Build the roster
          </Link>
          <Link
            href="/timesheets"
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-bold transition hover:border-accent hover:bg-surface-2"
          >
            Review hours &amp; submit
          </Link>
        </div>
      )}

      <Card title="Upcoming shifts">
        {shifts.loading ? (
          <Loading />
        ) : shifts.error ? (
          <div className="p-4">
            <Note tone="bad">{shifts.error}</Note>
          </div>
        ) : !shifts.data?.length ? (
          <Empty>
            Nothing rostered yet. Published shifts show up here as soon as your manager posts
            them.
          </Empty>
        ) : (
          <ul className="divide-y divide-border">
            {shifts.data.map((shift) => (
              <li key={shift.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <div className="w-32 shrink-0">
                  <p className="text-sm font-medium">{formatDayLabel(shift.workDate)}</p>
                  {shift.workDate === today && <Badge tone="accent">Today</Badge>}
                </div>
                <p className="nums w-32 shrink-0 text-sm">
                  {formatTimeRange(shift.startTime, shift.endTime)}
                </p>
                <p className="nums w-20 shrink-0 text-sm text-muted">
                  {formatDuration(shift.workedMinutes)}
                </p>
                <p className="min-w-0 flex-1 truncate text-sm text-muted">
                  {shift.storeName}
                  {shift.label ? ` · ${shift.label}` : ""}
                  {shift.breakMinutes ? ` · ${shift.breakMinutes}m break` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function HomePage() {
  return (
    <AppShell>
      <MyShifts />
    </AppShell>
  );
}
