# Roster, budget and payroll-confirmation implementation brief

This is the agreed shape to build from. It records what the current foundation
already does and keeps planned budget and payroll work separate from the source
of truth for paid hours.

## What is already in place

- Microsoft Entra single-tenant sign-in and an optional tenant allow-list.
- Store-scoped roster editing, publishing and read-only employee shifts.
- Manager correction of actual hours against the published roster.
- A locked submission, reviewer link, approve/send-back flow, audit log and
  CSV exports.
- An Admin-controlled reviewer email setting. The deployment environment value
  remains the fallback until it is saved in the application.

## Access model

| Level | Entra assignment | Scope |
| --- | --- | --- |
| Standard | Eligible user and roster member | Their own published shifts and their own acknowledgement/correction requests. |
| Manager | Store manager security group | Roster, budget and payroll review for that store. Cannot administer other stores or settings. |
| Admin | `SG-WGAS-Admins` | All stores, all manager capabilities, configuration and role-group setup. |

Elias and Kee should be made members of `SG-WGAS-Admins`. This requires the
actual Entra group membership to be changed by an Entra administrator; it is
not a change that can be safely inferred from application code. For the desired
"only Elias and Kee can access" starting point, set `ENTRA_STAFF_GROUP_IDS` to
that same group (or a deliberately managed access group containing only them).

## Roster and budget UI

Add a budget strip above each roster cycle rather than mixing budget values into
payroll confirmation:

1. **Rostered hours** — published and draft hours separately.
2. **Budget hours and dollars** — chosen budget version for the store/project
   and cycle.
3. **Variance** — hours and dollars over or under budget, with no payroll claim.
4. **Project allocation** — each shift has one project/cost centre initially;
   splitting a shift can be a later enhancement.

The initial budget model should be versioned, so changing a future budget never
rewrites historic comparisons:

```
project or cost centre → budget version → period allocation (hours, dollars)
shift → project allocation → rostered cost
timesheet line → actual cost → payroll variance
```

Before building the arithmetic, decide the rate source: one store default,
employee rate/effective date, award category, or an external payroll export.
Do not put pay rates in the browser or calculate them from an unversioned
current rate; historical payroll and budget reports would then change.

## Employee acknowledgement and exceptions

Standard users need a clear action on each published shift or pay-period
summary:

| State | Meaning | Manager outcome |
| --- | --- | --- |
| Pending | The employee has not responded. | Manager can still review actual hours. |
| Confirmed | The employee says rostered hours are correct. | Keep the rostered hours as the starting point. |
| Exception raised | Sick, leave, did not work, different start/finish, or other note. | Manager reviews, changes actual hours and records the reason. |
| Resolved | Manager has applied or declined the change with a note. | The final actual-hours line is ready for payroll submission. |

An acknowledgement must be immutable after the pay period is submitted, and
every change should enter the existing audit log. A leave submission should be
linked to an exception, not automatically overwrite worked hours. The current
application has no leave-system integration, so this first phase should support
a leave reference/attachment link and a manager decision; direct leave syncing
can follow once its source system and approval rules are known.

## Delivery order

1. Configure Entra groups, add Elias and Kee as admins, and migrate the new
   application settings table.
2. Add the Standard-user acknowledgement/exceptions screen and manager
   resolution queue.
3. Add project/cost-centre selection to shifts and a versioned hours-only
   budget. This proves the roster planning UI before sensitive wage data enters
   the product.
4. Add effective-dated rates and dollar variance only after the approved rate
   source is chosen.
5. Include acknowledgement state, exception reason and resolution in the
   payroll confirmation dialog and final CSV export.
