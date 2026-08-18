import { authenticate, requireStoreAccess } from "@/lib/auth/context";
import { json, route } from "@/lib/api";
import { currentPayPeriod, payPeriodFor } from "@/lib/pay-period";
import { ISO_DATE } from "@/lib/dates";
import { loadTimesheet } from "@/lib/timesheet";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ storeId: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const auth = await authenticate(request);
  const { storeId } = await params;
  const { store, canManage } = await requireStoreAccess(auth, storeId);

  const requested = new URL(request.url).searchParams.get("start");
  const range =
    requested && ISO_DATE.test(requested)
      ? payPeriodFor(requested)
      : currentPayPeriod(store.timezone);

  return json(
    await loadTimesheet(store, range, {
      canManage,
      isAdmin: auth.isAdmin,
      restrictToUserId: canManage ? undefined : auth.user.id,
    }),
  );
});
