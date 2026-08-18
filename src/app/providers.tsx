"use client";

import { useEffect, useState, type ReactNode } from "react";
import { EventType, type AuthenticationResult } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { isMsalConfigured, msalInstance } from "@/lib/msal";

/**
 * msal-browser v4 must be initialised before any component touches it, so the
 * tree is held back one tick rather than rendering against a half-built client.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isMsalConfigured()) {
      setError(
        "Entra sign-in is not configured. Set NEXT_PUBLIC_AZURE_CLIENT_ID, NEXT_PUBLIC_AZURE_TENANT_ID and NEXT_PUBLIC_API_SCOPE.",
      );
      return;
    }

    let cancelled = false;

    msalInstance
      .initialize()
      .then(() => {
        const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
        if (account) msalInstance.setActiveAccount(account);

        msalInstance.addEventCallback((event) => {
          if (
            event.eventType === EventType.LOGIN_SUCCESS ||
            event.eventType === EventType.ACQUIRE_TOKEN_SUCCESS
          ) {
            const payload = event.payload as AuthenticationResult;
            if (payload?.account) msalInstance.setActiveAccount(payload.account);
          }
        });

        if (!cancelled) setReady(true);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Sign-in failed to start");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <div className="max-w-md rounded-xl border border-border bg-surface p-6 text-sm">
          <h1 className="mb-2 text-base font-semibold">Configuration needed</h1>
          <p className="text-muted">{error}</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <p className="text-sm text-muted">Starting up…</p>
      </div>
    );
  }

  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}
