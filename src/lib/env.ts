/**
 * Server env is read lazily. Reading at module scope would break `next build`
 * on Vercel, which imports every route handler without runtime secrets present.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function optionalEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

/** Entra group object IDs that grant tenant-wide admin (comma separated). */
export function adminGroupIds(): string[] {
  return optionalEnv("ENTRA_ADMIN_GROUP_IDS")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Entra group object IDs whose members may sign in at all (optional gate). */
export function staffGroupIds(): string[] {
  return optionalEnv("ENTRA_STAFF_GROUP_IDS")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function reviewerEmail(): string {
  return optionalEnv("REVIEWER_EMAIL", "ahaworth@educomit.com.au");
}

export function appBaseUrl(): string {
  const explicit = optionalEnv("APP_BASE_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = optionalEnv("VERCEL_PROJECT_PRODUCTION_URL") || optionalEnv("VERCEL_URL");
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/** Client-safe values. Next.js inlines NEXT_PUBLIC_* at build time. */
export const publicEnv = {
  clientId: process.env.NEXT_PUBLIC_AZURE_CLIENT_ID ?? "",
  tenantId: process.env.NEXT_PUBLIC_AZURE_TENANT_ID ?? "",
  apiScope: process.env.NEXT_PUBLIC_API_SCOPE ?? "",
};
