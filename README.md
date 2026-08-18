# Who Gives A Shift

Rostering and timesheet approval for Kee, replacing Microsoft Teams Shifts.
Store managers build a roster, correct the hours actually worked at the end of
the pay cycle, and submit them for review.

- **Pay cycle:** Thursday → Wednesday
- **Sign-in:** Microsoft Entra ID, single-tenant, MSAL auth-code + PKCE
- **Roles:** Standard, Manager and Admin — enforced by Entra security groups
- **Submission:** emailed from the manager's own mailbox via Microsoft Graph to the reviewer set in Admin settings
- **Stack:** Next.js 15 (App Router) · TypeScript · Drizzle · Neon Postgres · Vercel

---

## How it works

**Manager** opens **Roster**, adds shifts across the seven-day cycle, and hits
*Publish*. Draft shifts are the manager's working copy and stay invisible to
staff until published.

**Staff** see their published shifts on **My shifts**. They cannot see the
roster board or anyone else's hours.

**On the closing Wednesday**, the manager opens **Timesheets** and clicks *Load
hours from the roster*. That seeds one editable line per published shift. They
correct the actual start, finish and break, add any unrostered days, then
*Submit for review*.

Submitting **locks the pay period** — no further roster or hours edits for those
dates — and emails the configured reviewer a summary with two CSVs attached (per-person
totals, and shift-by-shift detail). The email is sent **on behalf of the manager
who submitted it**: it leaves from their mailbox, appears in their Sent Items,
and a reply goes straight back to them rather than to a shared service account.

**The reviewer** is outside the tenant, so they get a signed capability link
rather than a login. It opens a read-only summary where they can **Approve**
(final) or **Send back for changes** (reopens the period and notifies the
manager). Links expire after 30 days; managers can re-send.

Every state change is written to `audit_log`.

---

## Setup

### 1. Entra ID

Follow **[SETUP-ENTRA.md](SETUP-ENTRA.md)** first — one app registration, one
exposed scope, four Graph permissions, and one security group. Nothing else
works until that is done.

### 2. Database

Create a Neon project (pick the region closest to your stores —
`ap-southeast-2` for Australia) and copy the pooled connection string into
`DATABASE_URL`.

Then apply the schema:

```bash
npm run db:migrate
```

That runs the checked-in migrations in `drizzle/` and records what it applied —
use it for anything real. `npm run db:push` diffs the schema straight onto the
database without a migration record; it is quicker while iterating locally, but
do not point it at production.

### 3. Local development

```bash
cp .env.example .env.local
```

Put your real values in **`.env.local`**, never in `.env.example` —
`.env.example` is committed to the repo and must only ever contain
placeholders. `.env.local` is gitignored.

Check everything before you rely on it:

```bash
npm run verify
```

That proves the Entra credentials work, the Graph permissions are consented,
and Neon is reachable with the schema applied. It never prints a secret. Run it
again first thing if anything mysteriously stops working — an expired client
secret is the most likely culprit.

Then:

```bash
npm run dev
```

Open http://localhost:3000 and sign in. As a member of `SG-WGAS-Admins` you will
see the **Admin** tab — create your first store there and leave its manager group
blank. Admins manage every store, so you can go straight to the Roster page, add
staff from the directory, and start rostering.

### 4. Deploy to Vercel

```bash
npx vercel link
```

Add every variable from your `.env.local` in **Project → Settings → Environment
Variables** (Production *and* Preview), then:

```bash
npx vercel --prod
```

`APP_BASE_URL` is only needed if you use a custom domain — otherwise the
reviewer link is built from Vercel's own URL. Remember to add the production
origin to the app registration's SPA redirect URIs.

---

## Project layout

```
src/
  app/
    page.tsx               My shifts (everyone)
    roster/                Roster board (managers)
    timesheets/            Hours review and submission (managers)
    admin/                 Stores and manager groups (admins)
    review/[token]/        External reviewer, no sign-in
    api/                   Route handlers
  components/              UI
  db/schema.ts             Drizzle schema
  lib/
    auth/verify.ts         Bearer-token verification against tenant JWKS
    auth/context.ts        Identity, group resolution, store authorisation
    pay-period.ts          Thursday→Wednesday cycle maths
    shift-time.ts          Wall-clock shift arithmetic
    graph.ts               App-only Graph: sendMail, user search, group lookup
    review-token.ts        Signed reviewer links
    submission.ts          Email HTML and CSV exports
```

### Access levels

| Level | Who it is | What they can do |
| --- | --- | --- |
| **Standard** | An eligible Entra user rostered at a store | Sign in and see only their published shifts. |
| **Manager** | A member of that store's Entra manager group | Build and publish that store's roster; prepare, correct and submit its hours. |
| **Admin** | A member of `SG-WGAS-Admins` | Everything a manager can do across all stores, plus stores and operational settings. |

The `manager`/`staff` value shown against a person on a roster is a roster label,
not an access grant. Store-management access is always determined by the Entra
manager group configured for that store.

### A few decisions worth knowing

**Shifts store a local date plus wall-clock times, not instants.** A roster
written as "Thu 09:00–17:00" must still read 09:00–17:00 after the clocks
change. Overnight shifts are implied by a finish time at or before the start.

**Rostered minutes are copied onto each timesheet line when it is seeded.** If
the roster is edited afterwards, the variance figure still reflects what was
actually rostered at the time.

**The period is locked before the email is sent.** A failed send is recoverable
with *Re-send email*; a period that reached payroll but stayed editable is not.

**Authorisation and rostering are separate.** Entra group membership decides who
*may manage* a store; the `store_members` table decides who *appears on* its
roster. That is why you can roster staff today without any per-store groups
existing — admins manage everything until you create them.

**Reviewer email is an Admin setting.** The first saved value in **Admin → Submission
settings** is used for new submissions, which makes non-production testing easy.
Until it has been saved, `REVIEWER_EMAIL` remains the safe deployment fallback.
Already-submitted periods retain the address they were sent to.

**Mail uses two different Graph flows.** The submission goes out delegated
(on-behalf-of the manager). The reviewer's approve / send-back notice is the one
case with no signed-in user — the reviewer follows a capability link — so it is
sent app-only from the reviewer's own mailbox, and is skipped gracefully if that
permission is not granted.

---

## Commands

```bash
npm run dev         # local dev server
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm run verify      # check Entra, Graph permissions and Neon against .env.local
npm run db:migrate  # apply checked-in migrations (use this for production)
npm run db:push     # diff schema straight onto the database (local iteration only)
npm run db:generate # regenerate SQL migrations after a schema change
npm run db:studio   # browse the database
```

---

## Operational notes

- **Client secret expiry.** Sign-in keeps working; the submission email stops.
  The app says so plainly rather than failing silently, and *Re-send email*
  recovers once the secret is rotated.
- **Managers need a licensed mailbox.** Sending on behalf of the signed-in user
  means whoever submits must have an Exchange Online mailbox. An unlicensed
  account can roster fine but cannot submit.
- **Timezones are per store.** Set the IANA name on the Admin screen. It decides
  what "today" and "this cycle" mean for that store.
- **Removing staff is a soft delete.** Rostered history has to survive someone
  leaving.
