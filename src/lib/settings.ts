import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { reviewerEmail } from "@/lib/env";

const SUBMISSION_KEY = "submission";

/**
 * The environment value remains a deployment-safe fallback until an admin has
 * configured the reviewer in the application. This also keeps existing live
 * deployments working immediately after the migration.
 */
export async function submissionReviewerSetting(): Promise<{
  email: string;
  source: "settings" | "environment";
}> {
  const [setting] = await getDb()
    .select({ email: appSettings.submissionReviewerEmail })
    .from(appSettings)
    .where(eq(appSettings.key, SUBMISSION_KEY))
    .limit(1);

  if (setting?.email) return { email: setting.email, source: "settings" };
  return { email: reviewerEmail(), source: "environment" };
}

export async function saveSubmissionReviewerEmail(email: string): Promise<void> {
  await getDb()
    .insert(appSettings)
    .values({ key: SUBMISSION_KEY, submissionReviewerEmail: email, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { submissionReviewerEmail: email, updatedAt: new Date() },
    });
}
