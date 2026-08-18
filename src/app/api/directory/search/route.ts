import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { stores } from "@/db/schema";
import { authenticate, canManageStore } from "@/lib/auth/context";
import { forbidden, json, route } from "@/lib/api";
import { isGraphConfigured, searchDirectory } from "@/lib/graph";

export const dynamic = "force-dynamic";

/** Tenant type-ahead, restricted to people who actually roster someone. */
export const GET = route(async (request: Request) => {
  const auth = await authenticate(request);

  if (!auth.isAdmin) {
    const active = await getDb().select().from(stores).where(eq(stores.active, true));
    if (!active.some((store) => canManageStore(auth, store))) {
      throw forbidden("Only store managers can search the directory");
    }
  }

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return json([]);

  if (!isGraphConfigured()) {
    throw forbidden("Directory search is unavailable until Graph credentials are configured");
  }

  return json(await searchDirectory(query));
});
