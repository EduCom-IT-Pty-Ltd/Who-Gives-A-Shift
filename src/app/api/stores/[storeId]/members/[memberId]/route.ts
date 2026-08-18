import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { storeMembers } from "@/db/schema";
import { authenticate, requireStoreManager } from "@/lib/auth/context";
import { recordAudit } from "@/lib/audit";
import { badRequest, json, notFound, route } from "@/lib/api";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ storeId: string; memberId: string }> };

const patchMember = z.object({
  role: z.enum(["manager", "staff"]).optional(),
  employmentType: z.string().trim().max(60).nullish(),
  active: z.boolean().optional(),
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const auth = await authenticate(request);
  const { storeId, memberId } = await params;
  await requireStoreManager(auth, storeId);

  const input = patchMember.parse(await request.json());
  const patch = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  if (!Object.keys(patch).length) throw badRequest("Nothing to update");

  const [member] = await getDb()
    .update(storeMembers)
    .set(patch)
    .where(and(eq(storeMembers.id, memberId), eq(storeMembers.storeId, storeId)))
    .returning();

  if (!member) throw notFound("Team member not found at this store");

  await recordAudit({
    actorUserId: auth.user.id,
    actorLabel: auth.user.upn,
    action: "member.update",
    entity: "store_member",
    entityId: memberId,
    detail: patch,
  });

  return json(member);
});

/** Soft-delete: rostered history must survive someone leaving. */
export const DELETE = route(async (request: Request, { params }: Params) => {
  const auth = await authenticate(request);
  const { storeId, memberId } = await params;
  await requireStoreManager(auth, storeId);

  const [member] = await getDb()
    .update(storeMembers)
    .set({ active: false })
    .where(and(eq(storeMembers.id, memberId), eq(storeMembers.storeId, storeId)))
    .returning();

  if (!member) throw notFound("Team member not found at this store");

  await recordAudit({
    actorUserId: auth.user.id,
    actorLabel: auth.user.upn,
    action: "member.deactivate",
    entity: "store_member",
    entityId: memberId,
    detail: { storeId },
  });

  return json({ ok: true });
});
