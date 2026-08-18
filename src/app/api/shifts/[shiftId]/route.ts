import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { shifts } from "@/db/schema";
import { authenticate, requireStoreManager } from "@/lib/auth/context";
import { recordAudit } from "@/lib/audit";
import { badRequest, json, notFound, route } from "@/lib/api";
import { normaliseTime, workedMinutes } from "@/lib/shift-time";
import { shiftPatchBody } from "@/lib/validators";
import type { ShiftDto } from "@/lib/types";
import { assertPeriodOpen } from "@/lib/period-access";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ shiftId: string }> };

async function loadManagedShift(request: Request, shiftId: string) {
  const auth = await authenticate(request);
  const [shift] = await getDb().select().from(shifts).where(eq(shifts.id, shiftId)).limit(1);
  if (!shift) throw notFound("Shift not found");
  await requireStoreManager(auth, shift.storeId);
  return { auth, shift };
}

export const PATCH = route(async (request: Request, { params }: Params) => {
  const { shiftId } = await params;
  const { auth, shift } = await loadManagedShift(request, shiftId);

  const input = shiftPatchBody.parse(await request.json());
  const patch = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  if (!Object.keys(patch).length) throw badRequest("Nothing to update");

  // Both the old and new dates matter: a shift must not be moved out of, or
  // into, a period that has already gone to payroll.
  await assertPeriodOpen(shift.storeId, shift.workDate);
  if (input.workDate && input.workDate !== shift.workDate) {
    await assertPeriodOpen(shift.storeId, input.workDate);
  }

  const next = {
    startTime: input.startTime ?? shift.startTime,
    endTime: input.endTime ?? shift.endTime,
    breakMinutes: input.breakMinutes ?? shift.breakMinutes,
  };
  const minutes = workedMinutes(next);
  if (minutes <= 0) throw badRequest("The break is longer than the shift");

  const [updated] = await getDb()
    .update(shifts)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(shifts.id, shiftId))
    .returning();

  await recordAudit({
    actorUserId: auth.user.id,
    actorLabel: auth.user.upn,
    action: "shift.update",
    entity: "shift",
    entityId: shiftId,
    detail: patch,
  });

  return json({
    id: updated.id,
    storeId: updated.storeId,
    userId: updated.userId,
    workDate: updated.workDate,
    startTime: normaliseTime(updated.startTime),
    endTime: normaliseTime(updated.endTime),
    breakMinutes: updated.breakMinutes,
    label: updated.label,
    notes: updated.notes,
    status: updated.status,
    workedMinutes: minutes,
  } satisfies ShiftDto);
});

export const DELETE = route(async (request: Request, { params }: Params) => {
  const { shiftId } = await params;
  const { auth, shift } = await loadManagedShift(request, shiftId);

  await assertPeriodOpen(shift.storeId, shift.workDate);
  await getDb().delete(shifts).where(eq(shifts.id, shiftId));

  await recordAudit({
    actorUserId: auth.user.id,
    actorLabel: auth.user.upn,
    action: "shift.delete",
    entity: "shift",
    entityId: shiftId,
    detail: { storeId: shift.storeId, workDate: shift.workDate, userId: shift.userId },
  });

  return json({ ok: true });
});
