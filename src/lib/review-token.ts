import { createHmac, timingSafeEqual } from "node:crypto";
import { requireEnv } from "./env";

/**
 * Signed, expiring links for the external reviewer. The reviewer is outside our
 * tenant, so they cannot hold an Entra account; a capability URL lets them open
 * exactly one submission without one. Links are read-and-decide only, and every
 * decision is written to the audit log against the link, not a user.
 */

const DEFAULT_TTL_DAYS = 30;

interface TokenPayload {
  /** Pay period id. */
  p: string;
  /** Expiry, epoch seconds. */
  e: number;
}

function secret(): Buffer {
  return Buffer.from(requireEnv("REVIEW_LINK_SECRET"), "utf8");
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function createReviewToken(payPeriodId: string, ttlDays = DEFAULT_TTL_DAYS): string {
  const payload: TokenPayload = {
    p: payPeriodId,
    e: Math.floor(Date.now() / 1000) + ttlDays * 86_400,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export type ReviewTokenResult =
  | { ok: true; payPeriodId: string; expiresAt: Date }
  | { ok: false; reason: "malformed" | "invalid" | "expired" };

export function verifyReviewToken(token: string): ReviewTokenResult {
  const [body, signature] = token.split(".");
  if (!body || !signature) return { ok: false, reason: "malformed" };

  const expected = Buffer.from(sign(body));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { ok: false, reason: "invalid" };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (!payload.p || typeof payload.e !== "number") return { ok: false, reason: "malformed" };
  if (payload.e * 1000 < Date.now()) return { ok: false, reason: "expired" };

  return { ok: true, payPeriodId: payload.p, expiresAt: new Date(payload.e * 1000) };
}
