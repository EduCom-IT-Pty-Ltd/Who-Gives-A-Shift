import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { shifts, storeMembers } from "@/db/schema";
import { authenticate, requireStoreManager } from "@/lib/auth/context";
import { recordAudit } from "@/lib/audit";
import { badRequest, json, route } from "@/lib/api";
import { normaliseTime, workedMinutes } from "@/lib/shift-time";
import { assertPeriodOpen } from "@/lib/period-access";
import { shiftBody } from "@/lib/validators";
import type { ShiftDto } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ storeId: string }> };

export const POST = route(async (request: Request, { params }: Params) => {
  const auth = await authenticate(request);
  const { storeId } = await params;
  await requireStoreManager(auth, storeId);

  const input = shiftBody.parse(await request.json());
  const db = getDb();

  const [membership] = await db
    .select({ id: storeMembers.id })
    .from(storeMembers)
    .where(
      and(
        eq(storeMembers.storeId, storeId),
        eq(storeMembers.userId, input.userId),
        eq(storeMembers.active, true),
      ),
    )
    .limit(1);

  if (!membership) throw badRequest("That person is not on this store's team");
  await assertPeriodOpen(storeId, input.workDate);

  const minutes = workedMinutes(input);
  if (minutes <= 0) throw badRequest("The break is longer than the shift");

  const [shift] = await db
    .insert(shifts)
    .values({
      storeId,
      userId: input.userId,
      workDate: input.workDate,
      startTime: input.startTime,
      endTime: input.endTime,
      breakMinutes: input.breakMinutes,
      label: input.label ?? null,
      notes: input.notes ?? null,
      createdBy: auth.user.id,
    })
    .returning();

  await recordAudit({
    actorUserId: auth.user.id,
    actorLabel: auth.user.upn,
    action: "shift.create",
    entity: "shift",
    entityId: shift.id,
    detail: { storeId, workDate: shift.workDate, userId: shift.userId },
  });

  return json(
    {
      id: shift.id,
      storeId: shift.storeId,
      userId: shift.userId,
      workDate: shift.workDate,
      startTime: normaliseTime(shift.startTime),
      endTime: normaliseTime(shift.endTime),
      breakMinutes: shift.breakMinutes,
      label: shift.label,
      notes: shift.notes,
      status: shift.status,
      workedMinutes: minutes,
    } satisfies ShiftDto,
    201,
  );
});
