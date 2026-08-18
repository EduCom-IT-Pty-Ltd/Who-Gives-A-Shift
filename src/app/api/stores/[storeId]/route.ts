import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { stores } from "@/db/schema";
import { authenticate, loadStore, requireAdmin } from "@/lib/auth/context";
import { recordAudit } from "@/lib/audit";
import { badRequest, json, route } from "@/lib/api";

export const dynamic = "force-dynamic";

const patchStore = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  managerGroupId: z.string().trim().uuid().nullish(),
  active: z.boolean().optional(),
});

type Params = { params: Promise<{ storeId: string }> };

export const PATCH = route(async (request: Request, { params }: Params) => {
  const auth = await authenticate(request);
  requireAdmin(auth);

  const { storeId } = await params;
  await loadStore(storeId);

  const input = patchStore.parse(await request.json());
  if (input.timezone) {
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: input.timezone });
    } catch {
      throw badRequest(`Unknown timezone: ${input.timezone}`);
    }
  }

  const patch = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  if (!Object.keys(patch).length) throw badRequest("Nothing to update");

  const [store] = await getDb().update(stores).set(patch).where(eq(stores.id, storeId)).returning();

  await recordAudit({
    actorUserId: auth.user.id,
    actorLabel: auth.user.upn,
    action: "store.update",
    entity: "store",
    entityId: storeId,
    detail: patch,
  });

  return json(store);
});
