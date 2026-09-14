# Day-of Caprio

Terse operator script for one calendar day. Full page map and state machine: [daily workflow](daily-workflow.md).

## Script

1. **Plan** — Open `/new` (optional `?date=YYYY-MM-DD`). Chat until the planner returns a validated proposal JSON.
2. **Confirm** — Accept the exact proposal. Chat never mutates tasks; only confirm saves the plan.
3. **Execute** — Work the day on `/today`. Complete or reorder unfinished tasks as needed.
4. **Review** — Open `/review`. Choose **Done**, **Tomorrow**, or **Drop** for every task, then close the day.
5. **Next morning** — Open `/today` for the next date. Tasks marked Tomorrow appear as **Carried over** (one-hop only).

## Not this flow

| Route | Role |
| --- | --- |
| `/capture` | Inbox for unplanned work. Not leftovers from review. |
| `/momentum` | History of past days (conversations, plans, reviews). Read-only reopen. |

## Prod smoke checklist

Run against production (or staging that mirrors it):

- [ ] **Auth0** — Sign in and land in the app (onboarding if first time).
- [ ] **Chat planner JSON** — On `/new`, send a planning turn; reply includes a validated proposal (not free-form only).
- [ ] **Confirm** — Confirm the proposal; tasks appear on `/today`.
- [ ] **Review + Tomorrow** — On `/review`, mark at least one task Tomorrow, Done/Drop the rest, close the day.
- [ ] **Carried over** — Next calendar day on `/today`, that task shows as Carried over (one-hop).
