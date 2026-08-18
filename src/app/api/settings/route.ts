import { z } from "zod";
import { authenticate, requireAdmin } from "@/lib/auth/context";
import { recordAudit } from "@/lib/audit";
import { json, route } from "@/lib/api";
import { saveSubmissionReviewerEmail, submissionReviewerSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

const patchSettings = z.object({
  submissionReviewerEmail: z.string().trim().email().max(320),
});

/** Admin-only operational settings, deliberately separate from deployment secrets. */
export const GET = route(async (request: Request) => {
  const auth = await authenticate(request);
  requireAdmin(auth);
  return json(await submissionReviewerSetting());
});

export const PATCH = route(async (request: Request) => {
  const auth = await authenticate(request);
  requireAdmin(auth);
  const { submissionReviewerEmail } = patchSettings.parse(await request.json());

  await saveSubmissionReviewerEmail(submissionReviewerEmail);
  await recordAudit({
    actorUserId: auth.user.id,
    actorLabel: auth.user.upn,
    action: "settings.submission_reviewer.update",
    entity: "app_settings",
    entityId: "submission",
    detail: { submissionReviewerEmail },
  });

  return json({ email: submissionReviewerEmail, source: "settings" as const });
});
