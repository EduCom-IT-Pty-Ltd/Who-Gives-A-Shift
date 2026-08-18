import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { stores, storeMembers, users, type Store, type User } from "@/db/schema";
import { adminGroupIds, staffGroupIds } from "@/lib/env";
import { forbidden, notFound } from "@/lib/api";
import { getMemberObjects } from "@/lib/graph";
import { bearerFrom, hasGroupOverage, verifyAccessToken, type EntraClaims } from "./verify";

export interface AuthContext {
  claims: EntraClaims;
  user: User;
  /** Entra security-group object IDs this user belongs to. */
  groupIds: string[];
  isAdmin: boolean;
}

interface CachedGroups {
  ids: string[];
  expiresAt: number;
}

const GROUP_TTL_MS = 5 * 60 * 1000;
const groupCache = new Map<string, CachedGroups>();

/**
 * Group IDs from the token when they fit, otherwise from Graph. Entra drops the
 * `groups` array once a user is in more than ~200 groups and substitutes an
 * overage claim; without this fallback those users would silently lose access.
 */
async function resolveGroupIds(claims: EntraClaims): Promise<string[]> {
  if (Array.isArray(claims.groups)) return claims.groups;
  if (!hasGroupOverage(claims)) return [];

  const oid = claims.oid!;
  const cached = groupCache.get(oid);
  if (cached && cached.expiresAt > Date.now()) return cached.ids;

  const ids = await getMemberObjects(oid);
  groupCache.set(oid, { ids, expiresAt: Date.now() + GROUP_TTL_MS });
  return ids;
}

function intersects(a: string[], b: string[]): boolean {
  if (!b.length) return false;
  const set = new Set(a);
  return b.some((id) => set.has(id));
}

/**
 * Verifies the caller, provisions them on first sign-in, and resolves their
 * Entra group memberships. Call this at the top of every authenticated route.
 */
export async function authenticate(request: Request): Promise<AuthContext> {
  const claims = await verifyAccessToken(bearerFrom(request));
  const groupIds = await resolveGroupIds(claims);
  const isAdmin = intersects(groupIds, adminGroupIds());

  const allowedStaffGroups = staffGroupIds();
  if (allowedStaffGroups.length && !isAdmin && !intersects(groupIds, allowedStaffGroups)) {
    throw forbidden("Your account is not enabled for Who Gives A Shift");
  }

  const upn = claims.preferred_username ?? claims.upn ?? claims.email ?? claims.oid!;
  const displayName = claims.name ?? upn;
  const email = claims.email ?? claims.preferred_username ?? null;
  const now = new Date();

  const [user] = await getDb()
    .insert(users)
    .values({ entraObjectId: claims.oid!, upn, displayName, email, lastSeenAt: now })
    .onConflictDoUpdate({
      target: users.entraObjectId,
      set: { upn, displayName, email, lastSeenAt: now },
    })
    .returning();

  return { claims, user, groupIds, isAdmin };
}

export async function loadStore(storeId: string): Promise<Store> {
  const [store] = await getDb().select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) throw notFound("Store not found");
  return store;
}

/** Managers are defined by membership of the store's Entra manager group. */
export function canManageStore(auth: AuthContext, store: Store): boolean {
  if (auth.isAdmin) return true;
  return Boolean(store.managerGroupId && auth.groupIds.includes(store.managerGroupId));
}

export async function requireStoreManager(auth: AuthContext, storeId: string): Promise<Store> {
  const store = await loadStore(storeId);
  if (!canManageStore(auth, store)) throw forbidden("You do not manage this store");
  return store;
}

/** Staff may read a store they are rostered at; managers may read any of theirs. */
export async function requireStoreAccess(
  auth: AuthContext,
  storeId: string,
): Promise<{ store: Store; canManage: boolean }> {
  const store = await loadStore(storeId);
  const canManage = canManageStore(auth, store);
  if (canManage) return { store, canManage };

  const [membership] = await getDb()
    .select({ id: storeMembers.id })
    .from(storeMembers)
    .where(
      and(
        eq(storeMembers.storeId, storeId),
        eq(storeMembers.userId, auth.user.id),
        eq(storeMembers.active, true),
      ),
    )
    .limit(1);

  if (!membership) throw forbidden("You are not rostered at this store");
  return { store, canManage: false };
}

export function requireAdmin(auth: AuthContext): void {
  if (!auth.isAdmin) throw forbidden("Tenant administrator access required");
}
