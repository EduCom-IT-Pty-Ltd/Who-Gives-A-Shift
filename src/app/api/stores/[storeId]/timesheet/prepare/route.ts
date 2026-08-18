import { z } from "zod";
import { authenticate, requireStoreManager } from "@/lib/auth/context";
import { recordAudit } from "@/lib/audit";
import { json, route } from "@/lib/api";
import { payPeriodFor } from "@/lib/pay-period";
import { isoDate } from "@/lib/validators";
import { loadTimesheet, preparePeriod } from "@/lib/timesheet";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ storeId: string }> };

const prepareBody = z.object({ startDate: isoDate });

/**
 * Opens the period for review, seeding it from the published roster. Safe to
 * call repeatedly — seeding only happens while the period is empty.
 */
export const POST = route(async (request: Request, { params }: Params) => {
  const auth = await authenticate(request);
  const { storeId } = await params;
  const store = await requireStoreManager(auth, storeId);

  const { startDate } = prepareBody.parse(await request.json());
  const range = payPeriodFor(startDate);
  const { periodId, seeded } = await preparePeriod(store, range);

  if (seeded) {
    await recordAudit({
      actorUserId: auth.user.id,
      actorLabel: auth.user.upn,
      action: "timesheet.seed",
      entity: "pay_period",
      entityId: periodId,
      detail: { storeId, range, seeded },
    });
  }

  return json(await loadTimesheet(store, range, { canManage: true, isAdmin: auth.isAdmin }));
});
