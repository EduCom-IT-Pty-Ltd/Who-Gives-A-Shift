import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { shifts, stores } from "@/db/schema";
import { authenticate } from "@/lib/auth/context";
import { json, route } from "@/lib/api";
import { addDays, todayInZone } from "@/lib/dates";
import { normaliseTime, workedMinutes } from "@/lib/shift-time";

export const dynamic = "force-dynamic";

/** The signed-in person's own published shifts across every store. */
export const GET = route(async (request: Request) => {
  const auth = await authenticate(request);
  const db = getDb();

  const from = todayInZone("Australia/Sydney");
  const rows = await db
    .select({ shift: shifts, storeName: stores.name, storeCode: stores.code })
    .from(shifts)
    .innerJoin(stores, eq(stores.id, shifts.storeId))
    .where(
      and(
        eq(shifts.userId, auth.user.id),
        eq(shifts.status, "published"),
        // A day of slack so an overnight shift started yesterday still shows.
        gte(shifts.workDate, addDays(from, -1)),
      ),
    )
    .orderBy(asc(shifts.workDate), asc(shifts.startTime))
    .limit(60);

  return json(
    rows.map(({ shift, storeName, storeCode }) => ({
      id: shift.id,
      storeName,
      storeCode,
      workDate: shift.workDate,
      startTime: normaliseTime(shift.startTime),
      endTime: normaliseTime(shift.endTime),
      breakMinutes: shift.breakMinutes,
      label: shift.label,
      notes: shift.notes,
      workedMinutes: workedMinutes({
        startTime: shift.startTime,
        endTime: shift.endTime,
        breakMinutes: shift.breakMinutes,
      }),
    })),
  );
});
