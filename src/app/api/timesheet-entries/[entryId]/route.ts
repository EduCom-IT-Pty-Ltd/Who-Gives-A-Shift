import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { payPeriods, timesheetEntries } from "@/db/schema";
import { authenticate, requireStoreManager } from "@/lib/auth/context";
import { recordAudit } from "@/lib/audit";
import { badRequest, json, notFound, route } from "@/lib/api";
import { workedMinutes } from "@/lib/shift-time";
import { clockTime } from "@/lib/validators";
import { assertEditable, toEntryDto } from "@/lib/timesheet";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ entryId: string }> };

const patchBody = z.object({
  startTime: clockTime.optional(),
  endTime: clockTime.optional(),
  breakMinutes: z.number().int().min(0).max(720).optional(),
  note: z.string().trim().max(500).nullish(),
});

async function loadEditableEntry(request: Request, entryId: string) {
  const auth = await authenticate(request);

  const [row] = await getDb()
    .select({ entry: timesheetEntries, period: payPeriods })
    .from(timesheetEntries)
    .innerJoin(payPeriods, eq(payPeriods.id, timesheetEntries.payPeriodId))
    .where(eq(timesheetEntries.id, entryId))
    .limit(1);

  if (!row) throw notFound("Timesheet line not found");
  await requireStoreManager(auth, row.period.storeId);
  assertEditable(row.period.status);

  return { auth, entry: row.entry };
}

export const PATCH = route(async (request: Request, { params }: Params) => {
  const { entryId } = await params;
  const { auth, entry } = await loadEditableEntry(request, entryId);

  const input = patchBody.parse(await request.json());
  const patch = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  if (!Object.keys(patch).length) throw badRequest("Nothing to update");

  const minutes = workedMinutes({
    startTime: input.startTime ?? entry.startTime,
    endTime: input.endTime ?? entry.endTime,
    breakMinutes: input.breakMinutes ?? entry.breakMinutes,
  });
  if (minutes <= 0) throw badRequest("The break is longer than the shift");

  const [updated] = await getDb()
    .update(timesheetEntries)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(timesheetEntries.id, entryId))
    .returning();

  await recordAudit({
    actorUserId: auth.user.id,
    actorLabel: auth.user.upn,
    action: "timesheet.entry.update",
    entity: "timesheet_entry",
    entityId: entryId,
    detail: { before: { ...entry, createdAt: undefined, updatedAt: undefined }, patch },
  });

  return json(toEntryDto(updated));
});

/** Used when a rostered shift was not actually worked. */
export const DELETE = route(async (request: Request, { params }: Params) => {
  const { entryId } = await params;
  const { auth, entry } = await loadEditableEntry(request, entryId);

  await getDb().delete(timesheetEntries).where(eq(timesheetEntries.id, entryId));

  await recordAudit({
    actorUserId: auth.user.id,
    actorLabel: auth.user.upn,
    action: "timesheet.entry.delete",
    entity: "timesheet_entry",
    entityId: entryId,
    detail: { userId: entry.userId, workDate: entry.workDate },
  });

  return json({ ok: true });
});
