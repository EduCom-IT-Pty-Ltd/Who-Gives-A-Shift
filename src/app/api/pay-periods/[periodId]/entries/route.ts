import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { storeMembers, timesheetEntries } from "@/db/schema";
import { authenticate } from "@/lib/auth/context";
import { recordAudit } from "@/lib/audit";
import { badRequest, json, route } from "@/lib/api";
import { containsDate, payPeriodFor } from "@/lib/pay-period";
import { workedMinutes } from "@/lib/shift-time";
import { clockTime, isoDate } from "@/lib/validators";
import { assertEditable, toEntryDto } from "@/lib/timesheet";
import { requireManagedPeriod } from "@/lib/period-access";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ periodId: string }> };

const entryBody = z.object({
  userId: z.string().uuid(),
  workDate: isoDate,
  startTime: clockTime,
  endTime: clockTime,
  breakMinutes: z.number().int().min(0).max(720).default(0),
  note: z.string().trim().max(500).nullish(),
});

/** Adds hours that were worked but never rostered — the common correction. */
export const POST = route(async (request: Request, { params }: Params) => {
  const auth = await authenticate(request);
  const { periodId } = await params;
  const { period } = await requireManagedPeriod(auth, periodId);
  assertEditable(period.status);

  const input = entryBody.parse(await request.json());
  const range = payPeriodFor(period.startDate);
  if (!containsDate(range, input.workDate)) {
    throw badRequest(`${input.workDate} is outside this pay period`);
  }

  const [membership] = await getDb()
    .select({ id: storeMembers.id })
    .from(storeMembers)
    .where(
      and(eq(storeMembers.storeId, period.storeId), eq(storeMembers.userId, input.userId)),
    )
    .limit(1);
  if (!membership) throw badRequest("That person is not on this store's team");

  const minutes = workedMinutes(input);
  if (minutes <= 0) throw badRequest("The break is longer than the shift");

  const [entry] = await getDb()
    .insert(timesheetEntries)
    .values({
      payPeriodId: periodId,
      userId: input.userId,
      workDate: input.workDate,
      startTime: input.startTime,
      endTime: input.endTime,
      breakMinutes: input.breakMinutes,
      rosteredMinutes: 0,
      note: input.note ?? null,
    })
    .returning();

  await recordAudit({
    actorUserId: auth.user.id,
    actorLabel: auth.user.upn,
    action: "timesheet.entry.add",
    entity: "timesheet_entry",
    entityId: entry.id,
    detail: { periodId, userId: input.userId, workDate: input.workDate },
  });

  return json(toEntryDto(entry), 201);
});
