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

## 5. Graph application permissions

**API permissions → Add a permission → Microsoft Graph → Application permissions**

| Permission | Why |
| --- | --- |
| `Mail.Send` | Sends the timesheet to the reviewer |
| `User.Read.All` | Directory type-ahead when adding staff to a store |
| `GroupMember.Read.All` | Group lookup fallback when a token hits the overage limit |

Then click **Grant admin consent for \<tenant\>**. All three are app-only, so
they do nothing until consent is granted.

If you configured *Groups assigned to the application* in step 4 and your
directory is small, `GroupMember.Read.All` is optional — but without it, a user
in many groups will silently lose their manager role. Granting it is safer.

### Restrict `Mail.Send` to one mailbox

`Mail.Send` as an application permission means *send as anyone in the tenant*.
Scope it down. In Exchange Online PowerShell:

```powershell
New-ApplicationAccessPolicy `
  -AppId "<client-id>" `
  -PolicyScopeGroupId "rosters@yourtenant.com.au" `
  -AccessRight RestrictAccess `
  -Description "Who Gives A Shift may only send as the rosters mailbox"
```

Then confirm it took effect:

```powershell
Test-ApplicationAccessPolicy -Identity "someone.else@yourtenant.com.au" -AppId "<client-id>"
```

That should come back **Denied**. Policy changes can take up to an hour to
propagate.

---

## 6. Client secret

**Certificates & secrets → New client secret.** Copy the *Value* immediately —
it is never shown again. That is `AZURE_CLIENT_SECRET`.

Put a calendar reminder in for the expiry date. When the secret expires, sign-in
keeps working but the submission email stops sending; the app reports this
plainly and the manager can use **Re-send email** once you rotate it.

---

## 7. Security groups

Create these in **Entra ID → Groups** (type: Security):

| Group | Purpose | Where it goes |
| --- | --- | --- |
| `WGAS Admins` | Full access to every store and the Admin screen | `ENTRA_ADMIN_GROUP_IDS` |
| `WGAS Managers – <Store>` | One per store; can roster and submit for that store | Admin screen, per store |
| `WGAS Staff` *(optional)* | Allow-list of who may sign in at all | `ENTRA_STAFF_GROUP_IDS` |

Copy each group's **Object ID**. Add yourself to `WGAS Admins` before first
sign-in, or nobody can create the first store.

Leaving `ENTRA_STAFF_GROUP_IDS` blank lets any account in your tenant sign in —
they will simply see an empty "My shifts" page until a manager rosters them.

---

## Checklist

- [ ] Single-tenant app registration created
- [ ] SPA redirect URIs for localhost and production
- [ ] `api://<client-id>/access_as_user` exposed and self-authorised
- [ ] Groups claim on access tokens, as Group ID
- [ ] `Mail.Send`, `User.Read.All`, `GroupMember.Read.All` granted admin consent
- [ ] `Mail.Send` restricted with an application access policy
- [ ] Client secret created and its expiry diarised
- [ ] `WGAS Admins` group created and you are in it
