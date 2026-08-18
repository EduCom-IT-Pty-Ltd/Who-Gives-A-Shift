import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { storeMembers, users } from "@/db/schema";
import type { MemberDto } from "./types";

/** Everyone on a store's roster, active and inactive, ordered by name. */
export async function listMembers(storeId: string): Promise<MemberDto[]> {
  return getDb()
    .select({
      id: storeMembers.id,
      userId: storeMembers.userId,
      role: storeMembers.role,
      employmentType: storeMembers.employmentType,
      active: storeMembers.active,
      displayName: users.displayName,
      upn: users.upn,
    })
    .from(storeMembers)
    .innerJoin(users, eq(users.id, storeMembers.userId))
    .where(eq(storeMembers.storeId, storeId))
    .orderBy(asc(users.displayName));
}
