import { asc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { stores } from "@/db/schema";
import { authenticate, requireAdmin } from "@/lib/auth/context";
import { recordAudit } from "@/lib/audit";
import { conflict, json, route } from "@/lib/api";

export const dynamic = "force-dynamic";

const createStore = z.object({
  name: z.string().trim().min(1).max(120),
  code: z
    .string()
    .trim()
    .min(1)
    .max(24)
    .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, dashes or underscores"),
  timezone: z.string().trim().min(1).max(64).default("Australia/Sydney"),
  managerGroupId: z.string().trim().uuid().nullish(),
});

/** Admin-only: the full store list, including inactive ones. */
export const GET = route(async (request: Request) => {
  const auth = await authenticate(request);
  requireAdmin(auth);
  return json(await getDb().select().from(stores).orderBy(asc(stores.name)));
});

export const POST = route(async (request: Request) => {
  const auth = await authenticate(request);
  requireAdmin(auth);

  const input = createStore.parse(await request.json());

  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: input.timezone });
  } catch {
    throw conflict(`Unknown timezone: ${input.timezone}`);
  }

  const [store] = await getDb()
    .insert(stores)
    .values({
      name: input.name,
      code: input.code.toUpperCase(),
      timezone: input.timezone,
      managerGroupId: input.managerGroupId ?? null,
    })
    .onConflictDoNothing({ target: stores.code })
    .returning();

  if (!store) throw conflict(`A store with code ${input.code.toUpperCase()} already exists`);

  await recordAudit({
    actorUserId: auth.user.id,
    actorLabel: auth.user.upn,
    action: "store.create",
    entity: "store",
    entityId: store.id,
    detail: { name: store.name, code: store.code },
  });

  return json(store, 201);
});
