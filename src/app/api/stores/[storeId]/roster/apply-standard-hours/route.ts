import { z } from "zod";
import { authenticate, requireStoreManager } from "@/lib/auth/context";
import { recordAudit } from "@/lib/audit";
import { json, route } from "@/lib/api";
import { payPeriodFor } from "@/lib/pay-period";
import { assertPeriodOpen } from "@/lib/period-access";
import { applyStandardHours } from "@/lib/standard-hours";
import { isoDate } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ storeId: string }> };

const applyBody = z.object({ startDate: isoDate });

/**
 * Fills one cycle from every active member's standard week. Days that already
 * hold a shift are left alone, so this can be run again after adding someone.
 */
export const POST = route(async (request: Request, { params }: Params) => {
  const auth = await authenticate(request);
  const { storeId } = await params;
  await requireStoreManager(auth, storeId);

  const { startDate } = applyBody.parse(await request.json());
  const range = payPeriodFor(startDate);
  await assertPeriodOpen(storeId, range.startDate);

  const result = await applyStandardHours(storeId, range, auth.user.id);

  if (result.created) {
    await recordAudit({
      actorUserId: auth.user.id,
      actorLabel: auth.user.upn,
      action: "roster.apply_standard_hours",
      entity: "store",
      entityId: storeId,
      detail: { range, ...result },
    });
  }

  return json({ ...result, period: range });
});
