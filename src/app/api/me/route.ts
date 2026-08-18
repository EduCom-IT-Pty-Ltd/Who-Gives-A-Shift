import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { stores, storeMembers } from "@/db/schema";
import { authenticate, canManageStore } from "@/lib/auth/context";
import { json, route } from "@/lib/api";
import type { MeResponse, StoreSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Identity plus every store the caller can see, manager or staff. */
export const GET = route(async (request: Request) => {
  const auth = await authenticate(request);
  const db = getDb();

  const allStores = await db.select().from(stores).where(eq(stores.active, true));

  const memberships = allStores.length
    ? await db
        .select({ storeId: storeMembers.storeId })
        .from(storeMembers)
        .where(
          and(
            eq(storeMembers.userId, auth.user.id),
            eq(storeMembers.active, true),
            inArray(
              storeMembers.storeId,
              allStores.map((s) => s.id),
            ),
          ),
        )
    : [];

  const memberOf = new Set(memberships.map((m) => m.storeId));

  const visible: StoreSummary[] = allStores
    .map((store) => ({
      id: store.id,
      name: store.name,
      code: store.code,
      timezone: store.timezone,
      canManage: canManageStore(auth, store),
    }))
    .filter((s) => s.canManage || memberOf.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const body: MeResponse = {
    user: {
      id: auth.user.id,
      displayName: auth.user.displayName,
      upn: auth.user.upn,
      email: auth.user.email,
    },
    isAdmin: auth.isAdmin,
    stores: visible,
  };

  return json(body);
});
