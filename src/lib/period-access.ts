import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { payPeriods, type PayPeriod, type Store } from "@/db/schema";
import { conflict, notFound } from "@/lib/api";
import { requireStoreManager, type AuthContext } from "@/lib/auth/context";
import { payPeriodFor } from "@/lib/pay-period";

/** Loads a pay period and asserts the caller manages the store it belongs to. */
export async function requireManagedPeriod(
  auth: AuthContext,
  periodId: string,
): Promise<{ period: PayPeriod; store: Store }> {
  const [period] = await getDb()
    .select()
    .from(payPeriods)
    .where(eq(payPeriods.id, periodId))
    .limit(1);

  if (!period) throw notFound("Pay period not found");
  const store = await requireStoreManager(auth, period.storeId);
  return { period, store };
}

/** A submitted pay period is closed to roster edits — payroll has the numbers. */
export async function assertPeriodOpen(storeId: string, workDate: string): Promise<void> {
  const { startDate } = payPeriodFor(workDate);
  const [period] = await getDb()
    .select({ status: payPeriods.status })
    .from(payPeriods)
    .where(and(eq(payPeriods.storeId, storeId), eq(payPeriods.startDate, startDate)))
    .limit(1);

  if (period && period.status !== "open") {
    throw conflict(`The pay period starting ${startDate} has already been submitted`);
  }
}
