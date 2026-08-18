import { getDb } from "@/db";
import { auditLog } from "@/db/schema";

/**
 * Best-effort audit trail. A logging failure must never fail the operation it
 * was recording, so errors are swallowed after being surfaced to the console.
 */
export async function recordAudit(input: {
  actorUserId?: string | null;
  actorLabel?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  detail?: unknown;
}): Promise<void> {
  try {
    await getDb().insert(auditLog).values({
      actorUserId: input.actorUserId ?? null,
      actorLabel: input.actorLabel ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      detail: input.detail ?? null,
    });
  } catch (error) {
    console.error("Failed to write audit entry", input.action, error);
  }
}
