import { z } from "zod";
import { getDb } from "@/db";
import { storeMembers, users } from "@/db/schema";
import { authenticate, requireStoreAccess, requireStoreManager } from "@/lib/auth/context";
import { recordAudit } from "@/lib/audit";
import { json, route } from "@/lib/api";
import { listMembers } from "@/lib/members";
import type { MemberDto } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ storeId: string }> };

const addMember = z.object({
  entraObjectId: z.string().trim().uuid(),
  upn: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().nullish(),
  role: z.enum(["manager", "staff"]).default("staff"),
  employmentType: z.string().trim().max(60).nullish(),
});

export const GET = route(async (request: Request, { params }: Params) => {
  const auth = await authenticate(request);
  const { storeId } = await params;
  await requireStoreAccess(auth, storeId);
  return json(await listMembers(storeId));
});

/**
 * Adds someone to the roster. The directory user is upserted first so staff can
 * be rostered before they have ever signed in.
 */
export const POST = route(async (request: Request, { params }: Params) => {
  const auth = await authenticate(request);
  const { storeId } = await params;
  await requireStoreManager(auth, storeId);

  const input = addMember.parse(await request.json());
  const db = getDb();

  const [user] = await db
    .insert(users)
    .values({
      entraObjectId: input.entraObjectId,
      upn: input.upn,
      displayName: input.displayName,
      email: input.email ?? null,
    })
    .onConflictDoUpdate({
      target: users.entraObjectId,
      set: { upn: input.upn, displayName: input.displayName },
    })
    .returning();

  const [member] = await db
    .insert(storeMembers)
    .values({
      storeId,
      userId: user.id,
      role: input.role,
      employmentType: input.employmentType ?? null,
    })
    .onConflictDoUpdate({
      target: [storeMembers.storeId, storeMembers.userId],
      set: { role: input.role, employmentType: input.employmentType ?? null, active: true },
    })
    .returning();

  await recordAudit({
    actorUserId: auth.user.id,
    actorLabel: auth.user.upn,
    action: "member.add",
    entity: "store_member",
    entityId: member.id,
    detail: { storeId, upn: user.upn, role: input.role },
  });

  return json(
    {
      id: member.id,
      userId: user.id,
      displayName: user.displayName,
      upn: user.upn,
      role: member.role,
      employmentType: member.employmentType,
      active: member.active,
    } satisfies MemberDto,
    201,
  );
});
