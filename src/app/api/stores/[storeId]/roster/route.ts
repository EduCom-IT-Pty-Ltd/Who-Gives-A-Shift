import { and, asc, between, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { shifts } from "@/db/schema";
import { authenticate, requireStoreAccess } from "@/lib/auth/context";
import { json, route } from "@/lib/api";
import { currentPayPeriod, payPeriodDays, payPeriodFor } from "@/lib/pay-period";
import { normaliseTime, workedMinutes } from "@/lib/shift-time";
import { ISO_DATE } from "@/lib/dates";
import type { RosterResponse, ShiftDto } from "@/lib/types";
import { listMembers } from "@/lib/members";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ storeId: string }> };

/**
 * One pay period of roster. Staff see published shifts only; a draft roster is
 * the manager's working copy and must not leak before it is published.
 */
export const GET = route(async (request: Request, { params }: Params) => {
  const auth = await authenticate(request);
  const { storeId } = await params;
  const { store, canManage } = await requireStoreAccess(auth, storeId);

  const requested = new URL(request.url).searchParams.get("start");
  const period =
    requested && ISO_DATE.test(requested)
      ? payPeriodFor(requested)
      : currentPayPeriod(store.timezone);

  const conditions = [
    eq(shifts.storeId, storeId),
    between(shifts.workDate, period.startDate, period.endDate),
  ];
  if (!canManage) {
    conditions.push(eq(shifts.status, "published"), eq(shifts.userId, auth.user.id));
  }

  const rows = await getDb()
    .select()
    .from(shifts)
    .where(and(...conditions))
    .orderBy(asc(shifts.workDate), asc(shifts.startTime));

  const body: RosterResponse = {
    store: {
      id: store.id,
      name: store.name,
      code: store.code,
      timezone: store.timezone,
      canManage,
    },
    period,
    days: payPeriodDays(period),
    members: canManage ? await listMembers(storeId) : [],
    shifts: rows.map(
      (s): ShiftDto => ({
        id: s.id,
        storeId: s.storeId,
        userId: s.userId,
        workDate: s.workDate,
        startTime: normaliseTime(s.startTime),
        endTime: normaliseTime(s.endTime),
        breakMinutes: s.breakMinutes,
        label: s.label,
        notes: s.notes,
        status: s.status,
        workedMinutes: workedMinutes({
          startTime: s.startTime,
          endTime: s.endTime,
          breakMinutes: s.breakMinutes,
        }),
      }),
    ),
  };

  return json(body);
});
