/**
 * Pre-flight check for the environment in .env.local.
 *
 *   npm run verify
 *
 * Proves the Entra credentials, the consented Graph permissions and the Neon
 * connection are all real before anyone discovers otherwise mid pay-cycle.
 * Never prints a secret — only whether it works.
 */
import { neon } from "@neondatabase/serverless";

let failures = 0;
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => {
  console.log(`  \x1b[31m✗\x1b[0m ${m}`);
  failures++;
};
const info = (m) => console.log(`  · ${m}`);

const tenant = process.env.AZURE_TENANT_ID;
const clientId = process.env.AZURE_CLIENT_ID;

console.log("\nEntra ID");
if (!tenant || !clientId || !process.env.AZURE_CLIENT_SECRET) {
  bad("AZURE_TENANT_ID, AZURE_CLIENT_ID or AZURE_CLIENT_SECRET is missing");
} else {
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: process.env.AZURE_CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const body = await res.json();

  if (!res.ok) {
    bad(`token request failed: ${body.error} — ${String(body.error_description).split("\n")[0]}`);
  } else {
    ok("app-only token acquired (tenant id, client id and secret all valid)");

    // `roles` in an app-only token lists the consented application permissions.
    const claims = JSON.parse(Buffer.from(body.access_token.split(".")[1], "base64url"));
    const roles = claims.roles ?? [];
    for (const needed of ["Mail.Send", "User.Read.All", "GroupMember.Read.All"]) {
      roles.includes(needed)
        ? ok(`application permission ${needed} consented`)
        : bad(`application permission ${needed} missing or not consented`);
    }

    // Secret expiry is the single most likely future breakage.
    const daysLeft = Math.round((claims.exp * 1000 - Date.now()) / 86_400_000);
    if (daysLeft < 0) bad("client secret appears to have expired");
  }
}

console.log("\nBrowser/server agreement");
for (const [server, browser] of [
  ["AZURE_TENANT_ID", "NEXT_PUBLIC_AZURE_TENANT_ID"],
  ["AZURE_CLIENT_ID", "NEXT_PUBLIC_AZURE_CLIENT_ID"],
]) {
  process.env[server] === process.env[browser]
    ? ok(`${server} matches ${browser}`)
    : bad(`${server} does not match ${browser} — check for stray whitespace`);
}
process.env.NEXT_PUBLIC_API_SCOPE === `api://${clientId}/access_as_user`
  ? ok("NEXT_PUBLIC_API_SCOPE matches the client id")
  : bad(`NEXT_PUBLIC_API_SCOPE should be api://${clientId}/access_as_user`);

console.log("\nApp settings");
(process.env.REVIEW_LINK_SECRET ?? "").length >= 32
  ? ok("REVIEW_LINK_SECRET present and long enough")
  : bad("REVIEW_LINK_SECRET missing or under 32 characters — reviewer links will fail");
(process.env.ENTRA_ADMIN_GROUP_IDS ?? "")
  .split(",")
  .filter(Boolean)
  .every((id) => /^[0-9a-fA-F-]{36}$/.test(id.trim()))
  ? ok("ENTRA_ADMIN_GROUP_IDS parses as group object IDs")
  : bad("ENTRA_ADMIN_GROUP_IDS should be one or more comma-separated GUIDs");
info(`submissions will be reviewed by ${process.env.REVIEWER_EMAIL}`);

console.log("\nNeon database");
try {
  const sql = neon(process.env.DATABASE_URL);
  await sql`select 1`;
  ok("connected");
  const tables = await sql`
    select tablename from pg_tables where schemaname = 'public' order by tablename`;
  const expected = [
    "audit_log",
    "pay_periods",
    "shifts",
    "store_members",
    "stores",
    "timesheet_entries",
    "users",
  ];
  const present = tables.map((t) => t.tablename);
  const missing = expected.filter((t) => !present.includes(t));
  missing.length
    ? bad(`schema not applied — missing ${missing.join(", ")}. Run: npm run db:migrate`)
    : ok(`all ${expected.length} tables present`);
} catch (error) {
  bad(`connection failed: ${error.message}`);
}

console.log(
  failures ? `\n\x1b[31m${failures} problem(s) found.\x1b[0m\n` : "\n\x1b[32mAll checks passed.\x1b[0m\n",
);
process.exit(failures ? 1 : 0);
