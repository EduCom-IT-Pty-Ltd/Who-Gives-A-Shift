import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { requireEnv } from "@/lib/env";
import { unauthorized } from "@/lib/api";

export interface EntraClaims extends JWTPayload {
  oid?: string;
  tid?: string;
  name?: string;
  preferred_username?: string;
  upn?: string;
  email?: string;
  scp?: string;
  groups?: string[];
  /** Present instead of `groups` when the user exceeds the token group limit. */
  _claim_names?: Record<string, string>;
  _claim_sources?: Record<string, { endpoint: string }>;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function keyStore() {
  if (!jwks) {
    const tenantId = requireEnv("AZURE_TENANT_ID");
    jwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`),
    );
  }
  return jwks;
}

export function bearerFrom(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) throw unauthorized();
  return token;
}

/**
 * Verifies an access token issued by our own app registration. The tenant check
 * is the single-tenant guarantee: only accounts in our directory get through,
 * regardless of what the token claims about itself.
 */
export async function verifyAccessToken(token: string): Promise<EntraClaims> {
  const tenantId = requireEnv("AZURE_TENANT_ID");
  const clientId = requireEnv("AZURE_CLIENT_ID");

  let payload: EntraClaims;
  try {
    const result = await jwtVerify<EntraClaims>(token, keyStore(), {
      // v2 tokens use the /v2.0 issuer; v1 tokens (accessTokenAcceptedVersion
      // unset on the app registration) use sts.windows.net.
      issuer: [
        `https://login.microsoftonline.com/${tenantId}/v2.0`,
        `https://sts.windows.net/${tenantId}/`,
      ],
      audience: [clientId, `api://${clientId}`],
    });
    payload = result.payload;
  } catch {
    throw unauthorized("Your session is not valid. Please sign in again.");
  }

  if (payload.tid !== tenantId) throw unauthorized("Account is outside this tenant");
  if (!payload.oid) throw unauthorized("Token is missing the oid claim");

  // Reject app-only tokens: this API is only ever called on behalf of a user.
  const scopes = (payload.scp ?? "").split(" ").filter(Boolean);
  if (!scopes.includes("access_as_user")) {
    throw unauthorized("Token is missing the access_as_user scope");
  }

  return payload;
}

/** True when Entra replaced the groups array with an overage indicator. */
export function hasGroupOverage(claims: EntraClaims): boolean {
  return Boolean(claims._claim_names?.groups || claims._claim_sources);
}
