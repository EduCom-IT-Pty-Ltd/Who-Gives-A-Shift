import { requireEnv } from "./env";

const GRAPH = "https://graph.microsoft.com/v1.0";

interface CachedToken {
  value: string;
  expiresAt: number;
}

let appToken: CachedToken | null = null;

/**
 * App-only token via client credentials. Cached per warm lambda, refreshed a
 * minute before expiry so an in-flight request never uses a stale token.
 */
async function getAppToken(): Promise<string> {
  if (appToken && appToken.expiresAt > Date.now()) return appToken.value;

  const tenantId = requireEnv("AZURE_TENANT_ID");
  const body = new URLSearchParams({
    client_id: requireEnv("AZURE_CLIENT_ID"),
    client_secret: requireEnv("AZURE_CLIENT_SECRET"),
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Entra token request failed (${res.status}): ${await res.text()}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  appToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  };
  return appToken.value;
}

/** Calls Graph as the app, or as a user when `token` is supplied. */
async function graphFetch(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<Response> {
  const bearer = token ?? (await getAppToken());
  return fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

/**
 * On-behalf-of: swaps the caller's token for this API for a delegated Graph
 * token. Everything sent this way comes from the signed-in person's own
 * mailbox, so it lands in their Sent Items and replies go back to them.
 */
async function getDelegatedToken(userAssertion: string, scope: string): Promise<string> {
  const tenantId = requireEnv("AZURE_TENANT_ID");
  const body = new URLSearchParams({
    client_id: requireEnv("AZURE_CLIENT_ID"),
    client_secret: requireEnv("AZURE_CLIENT_SECRET"),
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: userAssertion,
    scope,
    requested_token_use: "on_behalf_of",
  });

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    // The overwhelmingly likely cause is a missing delegated permission, and
    // the raw AADSTS blob does not say so in words anyone acts on.
    if (text.includes("AADSTS65001") || text.includes("AADSTS90008")) {
      throw new Error(
        "Microsoft has not consented this app to send mail as the signed-in user. Add the delegated Mail.Send permission to the app registration and grant admin consent.",
      );
    }
    throw new Error(`On-behalf-of token request failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

/**
 * Transitive group/role object IDs for a user. Used when the access token
 * carries a groups *overage* claim instead of the groups themselves.
 * Needs the `GroupMember.Read.All` application permission.
 */
export async function getMemberObjects(entraObjectId: string): Promise<string[]> {
  const res = await graphFetch(`/users/${encodeURIComponent(entraObjectId)}/getMemberObjects`, {
    method: "POST",
    body: JSON.stringify({ securityEnabledOnly: true }),
  });

  if (!res.ok) {
    throw new Error(`Graph getMemberObjects failed (${res.status}): ${await res.text()}`);
  }

  const json = (await res.json()) as { value: string[] };
  return json.value ?? [];
}

export interface MailAttachment {
  name: string;
  contentType: string;
  /** Raw file contents; base64-encoded here before sending. */
  content: string;
}

export interface SendMailInput {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  attachments?: MailAttachment[];
  /** Deliver a copy to the sending mailbox's Sent Items. */
  saveToSentItems?: boolean;
}

function buildMessage(input: SendMailInput) {
  return {
    subject: input.subject,
    body: { contentType: "HTML", content: input.html },
    toRecipients: input.to.map((address) => ({ emailAddress: { address } })),
    ccRecipients: (input.cc ?? []).map((address) => ({ emailAddress: { address } })),
    attachments: (input.attachments ?? []).map((a) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.name,
      contentType: a.contentType,
      contentBytes: Buffer.from(a.content, "utf8").toString("base64"),
    })),
  };
}

/**
 * Sends from the signed-in user's own mailbox via on-behalf-of. `userAssertion`
 * is the bearer token they presented to this API.
 */
export async function sendMailAsUser(
  userAssertion: string,
  input: SendMailInput,
): Promise<void> {
  const token = await getDelegatedToken(userAssertion, "https://graph.microsoft.com/Mail.Send");

  const res = await graphFetch(
    "/me/sendMail",
    {
      method: "POST",
      body: JSON.stringify({
        message: buildMessage(input),
        saveToSentItems: input.saveToSentItems ?? true,
      }),
    },
    token,
  );

  if (!res.ok) {
    throw new Error(`Graph sendMail failed (${res.status}): ${await res.text()}`);
  }
}

/**
 * Sends from a named mailbox using the app-only `Mail.Send` permission. Used
 * only where there is no signed-in user to send as — the reviewer follows a
 * capability link, not a login, so their decision notice is sent from their own
 * mailbox by the app.
 */
export async function sendMailAsApp(fromUpn: string, input: SendMailInput): Promise<void> {
  const res = await graphFetch(`/users/${encodeURIComponent(fromUpn)}/sendMail`, {
    method: "POST",
    body: JSON.stringify({
      message: buildMessage(input),
      saveToSentItems: input.saveToSentItems ?? true,
    }),
  });

  if (!res.ok) {
    throw new Error(`Graph sendMail failed (${res.status}): ${await res.text()}`);
  }
}

/** Enough config to call Graph at all. */
export function isGraphConfigured(): boolean {
  return Boolean(
    process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID,
  );
}

export interface DirectoryUser {
  id: string;
  displayName: string;
  userPrincipalName: string;
  mail: string | null;
  jobTitle: string | null;
}

/**
 * Type-ahead over tenant members so managers can roster someone who has not
 * signed in yet. Needs the `User.Read.All` application permission.
 * `$search` requires the eventual-consistency header.
 */
export async function searchDirectory(query: string, top = 15): Promise<DirectoryUser[]> {
  const escaped = query.replace(/"/g, "");
  const params = new URLSearchParams({
    $search: `"displayName:${escaped}" OR "mail:${escaped}" OR "userPrincipalName:${escaped}"`,
    $select: "id,displayName,userPrincipalName,mail,jobTitle",
    $top: String(top),
    $filter: "accountEnabled eq true",
    $count: "true",
  });

  const res = await graphFetch(`/users?${params.toString()}`, {
    headers: { ConsistencyLevel: "eventual" },
  });

  if (!res.ok) {
    throw new Error(`Graph user search failed (${res.status}): ${await res.text()}`);
  }

  const json = (await res.json()) as { value: DirectoryUser[] };
  return json.value ?? [];
}
