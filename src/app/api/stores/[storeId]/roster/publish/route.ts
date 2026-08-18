import { and, between, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { shifts } from "@/db/schema";
import { authenticate, requireStoreManager } from "@/lib/auth/context";
import { recordAudit } from "@/lib/audit";
import { json, route } from "@/lib/api";
import { payPeriodFor } from "@/lib/pay-period";
import { isoDate } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ storeId: string }> };

const publishBody = z.object({ startDate: isoDate });

/** Publishing makes the period's draft shifts visible to the staff on them. */
export const POST = route(async (request: Request, { params }: Params) => {
  const auth = await authenticate(request);
  const { storeId } = await params;
  await requireStoreManager(auth, storeId);

  const { startDate } = publishBody.parse(await request.json());
  const period = payPeriodFor(startDate);

  const published = await getDb()
    .update(shifts)
    .set({ status: "published", updatedAt: new Date() })
    .where(
      and(
        eq(shifts.storeId, storeId),
        eq(shifts.status, "draft"),
        between(shifts.workDate, period.startDate, period.endDate),
      ),
    )
    .returning({ id: shifts.id });

  await recordAudit({
    actorUserId: auth.user.id,
    actorLabel: auth.user.upn,
    action: "roster.publish",
    entity: "store",
    entityId: storeId,
    detail: { period, count: published.length },
  });

  return json({ published: published.length, period });
});
