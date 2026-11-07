# Plan the day

On `/new` a student dumps everything on their mind into the composer. The Caprio Daily Planner answers in the chat and returns a draft plan card ("Your proposed plan", "Needs your confirmation"). Chat never changes saved tasks. Only `Confirm plan` saves the draft, and then the app opens Today. `Discard proposal` clears the draft and saves nothing. `Revise proposal` keeps talking.

## Sub-features

- `plan-compose` sends a message from the composer, `textbox "Message about your day"`.
- `plan-draft` shows `region "Proposed plan"` with the proposed tasks, the available minutes, and the three actions, without changing saved tasks.
- `plan-confirm` saves the draft through `POST /api/day/plan/confirm` with `{ date, proposalId }` and opens `/today`.
- `plan-discard` clears the draft through `POST /api/day/plan/discard` and stays on `/new`.
- `plan-context` shows the top bar's `status "Task summary"` ("N remaining · M carried forward") and the `View tasks` link.
- `plan-unavailable` shows "Planning isn’t available right now. Please try again in a moment." with `Not saved` and `Try again` when the planner is unreachable, and writes no tasks.

## How to get to it (user POV)

- `Plan` in `navigation "Primary"` (`/new`).
- Opening the app (`/` or `/today` without `?date=`) while today's plan is in `planning` state, or on the first visit of the day. `AuthGuard` sends you to `/new`.
- `Plan day` / `Adjust plan` on Today (`/new?date=<day>` or `/new?date=<day>&intent=interrupt`).
- `Plan with my inbox` on Inbox, or `Discuss in Plan` in an inbox task's `More options for <title>` menu (`/new?…&taskId=…&seed=…`).
- `Open conversation` on a History day.

## Driving it with control-caprio

Preconditions:

- Full flow: a mock run (`$C up --mode mock`, `DOCTOR OK`). The real planner is not available locally (no `GROQ_API_KEY`), so a stack run can only show `plan-unavailable`.
- The spec calls `mockDay(page, { state: 'planning', tasks: [], firstVisit: true })` and then routes `/api/workflow`, `/api/tasks`, `/api/chat/stream` (SSE `event: done` with `{ text, workflow }`), `/api/day/plan/confirm`, and `/api/day/plan/discard`, as in `../drives/plan-day.mock.spec.ts`.

- **Open the composer.** Open the app. Run `await page.goto('/')`. The URL becomes `/new` and `textbox "Message about your day"` is enabled.
- **Send the dump.** Run `await page.getByRole('textbox', { name: 'Message about your day' }).fill(DUMP)` and `await page.getByRole('button', { name: 'Send prompt', exact: true }).click()`. The `region "Proposed plan"` appears and lists the proposed task titles.
- **Draft is not saved.** Assert that the recorded writes equal `['/api/chat/stream']` and that `region "Saved task changes"` has count 0. Nothing besides the message was posted.
- **Confirm.** Run `await proposal.getByRole('button', { name: 'Confirm plan' }).click()`. The URL is `/today` and `list "Remaining tasks"` has one `li` per proposed task. The confirm body matches `{ date, proposalId: 'draft-1' }`.
- **Discard (fresh page).** After a draft appears, run `await proposal.getByRole('button', { name: 'Discard proposal' }).click()`. `region "Proposed plan"` disappears, the URL stays `/new`, and the writes equal `['/api/chat/stream', '/api/day/plan/discard']`.
- **Unavailable (stack run).** Sign in with `enterAsDemoUser(page)`, open `Plan`, and send a message. The API log shows `503 POST "/api/chat/stream"`. The page shows the unavailable alert, the message is marked `Not saved`, and `sql('select count(*) from tasks')` is unchanged.
- **Proof.** Run `$C drive .cursor/skills/verify-caprio/drives/plan-day.mock.spec.ts`. The evidence holds `01-draft-plan.png`, `02-today-after-confirm.png`, `03-after-discard.png`, `confirm-writes.json`, and `discard-writes.json`.

## Gotchas

- Mock mode proves the UI and its request contract, not the planner, the Go `Confirm` handler, or the DB. For a backend change to confirm or discard, also run `cd backend && go test ./...`, and report the stack gap.
- The mocked SSE body must contain an `event: done` frame whose `workflow` carries the new `proposal`. Without it no draft plan appears.
- `mockDay` pins the clock to 2026-09-14. After Confirm the app opens bare `/today` because the fixture date is "today".
- When the day is `active` with tasks, or the URL has `intent=interrupt`, the empty composer shows chips under `aria-label "Quick interruption prompts"`. Drafts there usually change existing tasks through `operations` (`create`, `move`, …), listed under `list "Suggested task changes"`.
- `/new?date=<past day>` and closed days are read-only, with the text "Past conversations are read-only." or "This day is closed." and no composer.
- The model picker (`GPT-OSS 120B` button) is part of the composer. Do not click it accidentally when targeting `Send prompt`.
