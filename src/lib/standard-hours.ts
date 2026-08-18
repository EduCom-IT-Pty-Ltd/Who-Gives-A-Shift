import { and, asc, between, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { memberStandardShifts, shifts, storeMembers } from "@/db/schema";
import { badRequest } from "@/lib/api";
import { parseISODate } from "@/lib/dates";
import { payPeriodDays, type PayPeriodRange } from "@/lib/pay-period";
import { normaliseTime, workedMinutes } from "@/lib/shift-time";
import type { StandardShiftDto } from "@/lib/types";

export interface StandardShiftInput {
  weekday: number;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  label?: string | null;
}

const toDto = (row: {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  label: string | null;
}): StandardShiftDto => ({
  id: row.id,
  weekday: row.weekday,
  startTime: normaliseTime(row.startTime),
  endTime: normaliseTime(row.endTime),
  breakMinutes: row.breakMinutes,
  label: row.label,
  workedMinutes: workedMinutes({
    startTime: row.startTime,
    endTime: row.endTime,
    breakMinutes: row.breakMinutes,
  }),
});

/** Standard hours for many memberships at once, keyed by store member id. */
export async function standardShiftsByMember(
  storeMemberIds: string[],
): Promise<Map<string, StandardShiftDto[]>> {
  const map = new Map<string, StandardShiftDto[]>();
  if (!storeMemberIds.length) return map;

  const rows = await getDb()
    .select()
    .from(memberStandardShifts)
    .where(inArray(memberStandardShifts.storeMemberId, storeMemberIds))
    .orderBy(asc(memberStandardShifts.weekday), asc(memberStandardShifts.startTime));

  for (const row of rows) {
    const list = map.get(row.storeMemberId);
    if (list) list.push(toDto(row));
    else map.set(row.storeMemberId, [toDto(row)]);
  }
  return map;
}

export async function listStandardShifts(storeMemberId: string): Promise<StandardShiftDto[]> {
  return (await standardShiftsByMember([storeMemberId])).get(storeMemberId) ?? [];
}

/**
 * Replaces a member's whole pattern. The editor always sends the complete week,
 * so a diff would only add a way for the stored pattern and what the manager
 * sees to drift apart. Delete and re-insert go through `batch` rather than
 * `transaction`: the neon-http driver has no interactive transactions, and a
 * batch is the one form that still lands atomically.
 */
export async function replaceStandardShifts(
  storeMemberId: string,
  entries: StandardShiftInput[],
): Promise<StandardShiftDto[]> {
  for (const entry of entries) {
    if (workedMinutes(entry) <= 0) {
      throw badRequest("A standard shift's break is longer than the shift itself");
    }
  }

  const db = getDb();
  const clear = db
    .delete(memberStandardShifts)
    .where(eq(memberStandardShifts.storeMemberId, storeMemberId));

  if (entries.length) {
    await db.batch([
      clear,
      db.insert(memberStandardShifts).values(
        entries.map((entry) => ({
          storeMemberId,
          weekday: entry.weekday,
          startTime: entry.startTime,
          endTime: entry.endTime,
          breakMinutes: entry.breakMinutes,
          label: entry.label ?? null,
        })),
      ),
    ]);
  } else {
    await clear;
  }

  return listStandardShifts(storeMemberId);
}

export interface ApplyResult {
  created: number;
  /** Days already holding a shift for that person, left untouched. */
  skipped: number;
  /** Active members who have no pattern defined yet. */
  membersWithoutPattern: number;
}

/**
 * Stamps every active member's standard week onto one cycle as draft shifts.
 * A day that already has a shift for that person is never touched: the roster a
 * manager has already adjusted outranks the template it came from, so this is
 * safe to run twice.
 */
export async function applyStandardHours(
  storeId: string,
  range: PayPeriodRange,
  createdBy: string,
): Promise<ApplyResult> {
  const db = getDb();

  const members = await db
    .select({ id: storeMembers.id, userId: storeMembers.userId })
    .from(storeMembers)
    .where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.active, true)));

  if (!members.length) return { created: 0, skipped: 0, membersWithoutPattern: 0 };

  const patterns = await standardShiftsByMember(members.map((m) => m.id));

  const existing = await db
    .select({ userId: shifts.userId, workDate: shifts.workDate })
    .from(shifts)
    .where(
      and(eq(shifts.storeId, storeId), between(shifts.workDate, range.startDate, range.endDate)),
    );

  const taken = new Set(existing.map((s) => `${s.userId}|${s.workDate}`));
  const days = payPeriodDays(range);

  const rows: (typeof shifts.$inferInsert)[] = [];
  let skipped = 0;
  let membersWithoutPattern = 0;

  for (const member of members) {
    const pattern = patterns.get(member.id);
    if (!pattern?.length) {
      membersWithoutPattern += 1;
      continue;
    }

    for (const day of days) {
      const forDay = pattern.filter((p) => p.weekday === parseISODate(day).getUTCDay());
      if (!forDay.length) continue;

      if (taken.has(`${member.userId}|${day}`)) {
        skipped += forDay.length;
        continue;
      }

      for (const slot of forDay) {
        rows.push({
          storeId,
          userId: member.userId,
          workDate: day,
          startTime: slot.startTime,
          endTime: slot.endTime,
          breakMinutes: slot.breakMinutes,
          label: slot.label,
          createdBy,
        });
      }
    }
  }

  if (rows.length) await db.insert(shifts).values(rows);

  return { created: rows.length, skipped, membersWithoutPattern };
}
