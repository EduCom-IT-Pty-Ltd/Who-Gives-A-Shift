# Entra ID and Microsoft Graph setup

You only need **one app registration**. It does three jobs: it signs people in
(SPA), it protects the API (exposed scope), and it sends the submission email
(app-only Graph). Do these in order.

---

## 1. Create the app registration

**Entra admin centre → App registrations → New registration**

| Field | Value |
| --- | --- |
| Name | `Who Gives A Shift` |
| Supported account types | **Accounts in this organizational directory only (single tenant)** |
| Redirect URI | leave blank for now |

Copy the **Application (client) ID** and **Directory (tenant) ID** from the
Overview page — they become `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` and their
`NEXT_PUBLIC_` twins.

Single-tenant is what keeps sign-in restricted to your directory. The API also
re-checks the `tid` claim on every request, so a token from any other tenant is
rejected even if the sign-in surface were ever misconfigured.

---

## 2. Add the SPA redirect URIs

**Authentication → Add a platform → Single-page application**

Add each origin you will use — no trailing slash, no path:

```
http://localhost:3000
https://who-gives-a-shift.vercel.app
```

Add your production custom domain too if you have one. Vercel preview
deployments get a new hostname per deploy, so either add the ones you actually
use or test previews against localhost.

Leave both implicit-grant checkboxes **off** — MSAL uses the auth-code flow with
PKCE.

---

## 3. Expose the API scope

**Expose an API → Set** the Application ID URI. Accept the default
`api://<client-id>`.

**Add a scope:**

| Field | Value |
| --- | --- |
| Scope name | `access_as_user` |
| Who can consent | Admins and users |
| Admin consent display name | Access Who Gives A Shift |
| Admin consent description | Allows the app to call its own API as the signed-in user |
| State | Enabled |

Then under **Authorized client applications**, click *Add a client application*,
paste this same app's **client ID**, and tick `access_as_user`. That is what lets
the SPA get a token for its own API without a second consent prompt.

`NEXT_PUBLIC_API_SCOPE` is the full string: `api://<client-id>/access_as_user`.

---

## 4. Emit the groups claim

Roles come from security-group membership, so the token has to carry the groups.

**Token configuration → Add groups claim** → tick **Security groups**. Under
*Access* choose **Group ID**.

> **Recommended:** if your directory is large, pick *Groups assigned to the
> application* instead of *Security groups* and assign only the WGAS groups.
> Entra drops the `groups` array entirely once a user is in more than ~200
> groups. The app handles that overage by calling Graph, but avoiding it is
> faster and one less permission in play.

Also set **Manifest → `accessTokenAcceptedVersion`** to `2` if it is `null`.
(The API accepts both v1 and v2 tokens, but v2 is the current default and keeps
the audience claim tidy.)

---

## 5. Graph permissions

**API permissions → Add a permission → Microsoft Graph**

Under **Delegated permissions**:

| Permission | Why |
| --- | --- |
| `Mail.Send` | Sends the timesheet **as the signed-in manager** |

Under **Application permissions**:

| Permission | Why |
| --- | --- |
| `User.Read.All` | Directory type-ahead when adding staff to a store |
| `GroupMember.Read.All` | Group lookup fallback when a token hits the overage limit |
| `Mail.Send` | Sends the reviewer's approve / send-back notice |

Then click **Grant admin consent for \<tenant\>**.

### Why both kinds

The submission email is sent **on behalf of the manager who submitted it**. It
leaves from their own mailbox, lands in their Sent Items, and when Allan hits
reply it goes straight back to them — no shared service mailbox involved. That
is the delegated `Mail.Send`.

The approve / send-back notice is the one case with no signed-in user: the
reviewer follows a capability link rather than logging in. That notice is sent
from the reviewer's own mailbox (`REVIEWER_EMAIL`) by the app, which needs the
application `Mail.Send`.

If you would rather not grant application `Mail.Send` at all, the app degrades
cleanly — the decision is still recorded and the manager sees it in-app the next
time they open the period; they just do not get an email about it.

## 6. Client secret

**Certificates & secrets → New client secret.** Copy the *Value* immediately —
it is never shown again. That is `AZURE_CLIENT_SECRET`.

Put a calendar reminder in for the expiry date. When the secret expires, sign-in
keeps working but the submission email stops sending; the app reports this
plainly and the manager can use **Re-send email** once you rotate it.

---

## 7. Security groups

Only one group is needed to get running:

| Group | Purpose | Where it goes |
| --- | --- | --- |
| `SG-WGAS-Admins` | Full access to every store and the Admin screen | `ENTRA_ADMIN_GROUP_IDS` |

Copy its **Object ID** from **Entra ID → Groups → SG-WGAS-Admins → Overview**
into `ENTRA_ADMIN_GROUP_IDS`. Make sure you are a *member*, not only an owner —
ownership does not put you in the `groups` claim.

Admins manage every store, so leave each store's manager group blank on the
Admin screen for now. Staff are added to a store's roster individually through
the directory search on the Roster page; that is independent of group
membership, so nothing else needs setting up before you can roster people.

### Later, when you split stores out

Create one `SG-WGAS-Managers-<Store>` group per location, paste its object ID
against that store on the Admin screen, and its members gain roster and submit
rights for that store only. Admins keep access to everything either way.

Optionally set `ENTRA_STAFF_GROUP_IDS` to a group that gates who can sign in at
all. Left blank, any account in your tenant can sign in — they simply see an
empty "My shifts" page until someone rosters them.

## Checklist

- [ ] Single-tenant app registration created
- [ ] SPA redirect URIs for localhost and production
- [ ] `api://<client-id>/access_as_user` exposed and self-authorised
- [ ] Groups claim on access tokens, as Group ID
- [ ] Delegated `Mail.Send` added
- [ ] Application `User.Read.All`, `GroupMember.Read.All`, `Mail.Send` added
- [ ] Admin consent granted for all of the above
- [ ] Client secret created and its expiry diarised
- [ ] `SG-WGAS-Admins` created, you are a **member**, object ID in `ENTRA_ADMIN_GROUP_IDS`
