# Who Gives A Shift

Rostering and timesheet approval for Kee, replacing Microsoft Teams Shifts.
Store managers build a roster, correct the hours actually worked at the end of
the pay cycle, and submit them for review.

- **Pay cycle:** Thursday → Wednesday
- **Sign-in:** Microsoft Entra ID, single-tenant, MSAL auth-code + PKCE
- **Roles:** Entra security groups
- **Submission:** emailed via Microsoft Graph to `ahaworth@educomit.com.au`
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
dates — and emails the reviewer a summary with two CSVs attached (per-person
totals, and shift-by-shift detail).

**The reviewer** is outside the tenant, so they get a signed capability link
rather than a login. It opens a read-only summary where they can **Approve**
(final) or **Send back for changes** (reopens the period and notifies the
manager). Links expire after 30 days; managers can re-send.

Every state change is written to `audit_log`.

---

## Setup

### 1. Entra ID

Follow **[SETUP-ENTRA.md](SETUP-ENTRA.md)** first — one app registration, one
scope, three Graph permissions, and the security groups. Nothing else works
until that is done.

### 2. Database

Create a Neon project (pick the region closest to your stores —
`ap-southeast-2` for Australia) and copy the pooled connection string into
`DATABASE_URL`.

Then push the schema:

```bash
npm run db:push
```

`drizzle/0000_*.sql` is the same schema as a checked-in migration if you would
rather apply it by hand.

### 3. Local development

```bash
cp .env.example .env.local
```

Fill in `.env.local`, then:

```bash
npm run dev
```

Open http://localhost:3000 and sign in. As a member of `WGAS Admins` you will
see the **Admin** tab — create your first store there, paste in its manager
group's object ID, and you are ready to roster.

### 4. Deploy to Vercel

```bash
npx vercel link
```

Add every variable from `.env.example` in **Project → Settings → Environment
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
roster.

---

## Commands

```bash
npm run dev         # local dev server
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm run db:push     # apply schema to Neon
npm run db:generate # regenerate SQL migrations after a schema change
npm run db:studio   # browse the database
```

---

## Operational notes

- **Client secret expiry.** Sign-in keeps working; the submission email stops.
  The app says so plainly rather than failing silently, and *Re-send email*
  recovers once the secret is rotated.
- **Timezones are per store.** Set the IANA name on the Admin screen. It decides
  what "today" and "this cycle" mean for that store.
- **Removing staff is a soft delete.** Rostered history has to survive someone
  leaving.
