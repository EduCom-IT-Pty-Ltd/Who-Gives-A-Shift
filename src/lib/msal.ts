"use client";

import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type Configuration,
  type AccountInfo,
} from "@azure/msal-browser";
import { publicEnv } from "./env";

/**
 * Single-tenant by construction: the authority points at our directory, so the
 * account picker will not accept personal or foreign-tenant accounts. The API
 * re-checks the `tid` claim regardless — the client is never the authority.
 */
export const msalConfig: Configuration = {
  auth: {
    clientId: publicEnv.clientId,
    authority: `https://login.microsoftonline.com/${publicEnv.tenantId}`,
    redirectUri: typeof window === "undefined" ? undefined : window.location.origin,
    postLogoutRedirectUri: "/",
    navigateToLoginRequestUrl: true,
  },
  cache: {
    // sessionStorage keeps tokens out of long-lived browser state on the shared
    // machines that sit on a shop counter.
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
};

export const loginRequest = {
  scopes: [publicEnv.apiScope].filter(Boolean),
};

export const msalInstance = new PublicClientApplication(msalConfig);

export function isMsalConfigured(): boolean {
  return Boolean(publicEnv.clientId && publicEnv.tenantId && publicEnv.apiScope);
}

/**
 * Silent-first token acquisition. Falls back to a redirect only when Entra says
 * interaction is genuinely required (expired refresh token, new MFA prompt).
 */
export async function acquireToken(account: AccountInfo): Promise<string> {
  try {
    const result = await msalInstance.acquireTokenSilent({ ...loginRequest, account });
    return result.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      await msalInstance.acquireTokenRedirect({ ...loginRequest, account });
    }
    throw error;
  }
}
