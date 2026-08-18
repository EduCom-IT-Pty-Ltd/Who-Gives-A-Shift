"use client";

import { useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { acquireToken } from "./msal";
import type { ApiErrorBody } from "./types";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Authenticated fetch. Every call gets a fresh silent token so a long-lived tab
 * never sends an expired one, and error bodies surface as readable messages.
 */
export function useApi() {
  const { instance, accounts } = useMsal();

  return useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const account = instance.getActiveAccount() ?? accounts[0];
      if (!account) throw new HttpError(401, "You are signed out. Please sign in again.");

      const token = await acquireToken(account);

      const response = await fetch(path, {
        ...init,
        headers: {
          authorization: `Bearer ${token}`,
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...(init.headers ?? {}),
        },
      });

      if (!response.ok) {
        let message = `Request failed (${response.status})`;
        let detail: unknown;
        try {
          const body = (await response.json()) as ApiErrorBody;
          if (body?.error) message = body.error;
          detail = body?.detail;
        } catch {
          // Non-JSON error (proxy timeout, HTML error page) — keep the default.
        }
        throw new HttpError(response.status, message, detail);
      }

      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    },
    [instance, accounts],
  );
}

export const jsonBody = (data: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(data),
});

export const patchBody = (data: unknown): RequestInit => ({
  method: "PATCH",
  body: JSON.stringify(data),
});
