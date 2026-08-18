import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { storeMembers } from "@/db/schema";
import { authenticate, requireStoreAccess, requireStoreManager } from "@/lib/auth/context";
import { recordAudit } from "@/lib/audit";
import { json, notFound, route } from "@/lib/api";
import { listStandardShifts, replaceStandardShifts } from "@/lib/standard-hours";
import { standardHoursBody } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ storeId: string; memberId: string }> };

/** Guards against editing a membership by id that belongs to another store. */
async function requireMembership(storeId: string, memberId: string): Promise<void> {
  const [member] = await getDb()
    .select({ id: storeMembers.id })
    .from(storeMembers)
    .where(and(eq(storeMembers.id, memberId), eq(storeMembers.storeId, storeId)))
    .limit(1);

  if (!member) throw notFound("Team member not found at this store");
}

export const GET = route(async (request: Request, { params }: Params) => {
  const auth = await authenticate(request);
  const { storeId, memberId } = await params;
  await requireStoreAccess(auth, storeId);
  await requireMembership(storeId, memberId);

  return json(await listStandardShifts(memberId));
});

/** Replaces the whole recurring week for one person. */
export const PUT = route(async (request: Request, { params }: Params) => {
  const auth = await authenticate(request);
  const { storeId, memberId } = await params;
  await requireStoreManager(auth, storeId);
  await requireMembership(storeId, memberId);

  const { shifts } = standardHoursBody.parse(await request.json());
  const saved = await replaceStandardShifts(memberId, shifts);

  await recordAudit({
    actorUserId: auth.user.id,
    actorLabel: auth.user.upn,
    action: "member.standard_hours.update",
    entity: "store_member",
    entityId: memberId,
    detail: { storeId, slots: saved.length },
  });

  return json(saved);
});
