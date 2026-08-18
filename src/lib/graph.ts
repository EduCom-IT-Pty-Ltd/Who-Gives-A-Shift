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

async function graphFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAppToken();
  return fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
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

/**
 * Sends as GRAPH_SENDER_UPN using the `Mail.Send` application permission.
 * Scope that permission to the single sending mailbox with an application
 * access policy — see SETUP-ENTRA.md — or the app can mail as anyone.
 */
export async function sendMail(input: SendMailInput): Promise<void> {
  const sender = requireEnv("GRAPH_SENDER_UPN");

  const message = {
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

  const res = await graphFetch(`/users/${encodeURIComponent(sender)}/sendMail`, {
    method: "POST",
    body: JSON.stringify({ message, saveToSentItems: input.saveToSentItems ?? true }),
  });

  if (!res.ok) {
    throw new Error(`Graph sendMail failed (${res.status}): ${await res.text()}`);
  }
}

export function isGraphConfigured(): boolean {
  return Boolean(
    process.env.AZURE_CLIENT_SECRET && process.env.GRAPH_SENDER_UPN && process.env.AZURE_TENANT_ID,
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
