# Today checklist

Today (`/today?date=<day>`) is the saved plan for a day: "Your tasks" with the remaining count, "N of M completed" with a progress bar, minutes estimated against minutes available, and the remaining tasks in priority order. Tasks can be checked off, reordered, and expanded for details. A "Carried forward" disclosure lists unfinished tasks from earlier days, and a "Completed" disclosure lists finished ones. `Plan day` or `Adjust plan` returns to the conversation, and `Review day` starts the end-of-day review.

## Sub-features

- `today-list`: `list "Remaining tasks"` (an `ol`, one `li` per new task) under `heading "Your tasks"`.
- `today-check`: `checkbox "Mark <title> complete"` / `"Mark <title> incomplete"`, saved immediately (`PATCH /api/tasks/:id`). `progressbar "Tasks completed"` `aria-valuenow` updates, and the task moves under "Completed · N".
- `today-reorder`: `button "Reorder <title>"` (drag handle, keyboard sortable) and `button "Task actions for <title>"` (menu with move actions). Both save through `POST /api/tasks/reorder`.
- `today-carried`: the `.today-carried` disclosure ("N carried forward"), holding `list "Carried forward tasks"`.
- `today-details`: a task row's `summary`, which expands its description.
- `today-navigation`: `Plan day` (planning) or `Adjust plan` (active) links to `/new`, and `Review day` links to `/review?date=<day>`. The date picker is `button "Previous day"`, `"Next day"`, or `"Choose day, <label>"`.
- `today-readonly`: past or closed days show a read-only summary (`View review`, `Add tasks`) and disable the checkboxes.

## How to get to it (user POV)

- `Today` in `navigation "Primary"`. This opens `/today`, which redirects to `/new` while today is still in planning or on the first visit of the day.
- `View tasks` in the Plan top bar (`/today?date=<day>`). This always opens the checklist.
- After `Confirm plan` on a draft, the app opens `/today`.
- `View day for <date>` on History opens `/today?date=<day>` (read-only for past days).

## Driving it with control-caprio

Preconditions:

- Check-off and reorder: a stack run with `DOCTOR OK`, signed in with `enterAsDemoUser(page)`, and at least one task planned for today. The easiest way to create one is through Inbox → `Add to today`, as `../drives/day-loop.stack.spec.ts` does.
- Carried forward: a mock run. Producing it in stack mode needs a previous closed day plus rollover, and this skill has not exercised that path.

- **Open the checklist.** Run `await page.goto('/today?date=' + await localDay(page))`, the View tasks route. `heading "Your tasks"` and `list "Remaining tasks"` are visible.
- **Check off.** Run `await page.getByRole('checkbox', { name: 'Mark <title> complete' }).click()`. `progressbar "Tasks completed"` `aria-valuenow` goes up by 1, and `sql("select status, completed from tasks where title = '<title>'")` returns `completed<TAB>t`.
- **Uncheck.** Open "Completed · N" (`page.locator('.today-page details').filter({ hasText: 'Completed' }).locator('summary').click()`), then run `getByRole('checkbox', { name: 'Mark <title> incomplete' }).click()`. `aria-valuenow` goes down by 1.
- **Carried forward (mock).** Run `mockDay(page, { state: 'planning', tasks: tasksForDay().map(t => ({ ...t, deferCount: 1 })), firstVisit: true, carryoverOrigins: { 'task-0': '2026-09-13', … } })`, then `page.goto('/today?date=2026-09-14')` and `page.locator('.today-carried > summary').click()`. `list "Carried forward tasks"` has one `li` per task. See `frontend/e2e/morning-entry.spec.ts`.
- **Review entry.** Run `await page.getByRole('link', { name: 'Review day', exact: true }).click()`. The URL is `/review?date=<day>`.
- **Proof.** `$C drive .cursor/skills/verify-caprio/drives/day-loop.stack.spec.ts` saves `01-today-checked.png/.aria.yml` and `01-db-task.txt`.

## Gotchas

- The checkbox is controlled by the server response. `locator.check()` fails with "Clicking the checkbox did not change its state" even though the save went through. Use `click()` and assert on the progress bar or on SQL.
- Rows briefly move while the save is pending, so the controls are disabled (`busy`). Wait for `aria-valuenow`, not a timeout.
- `Review day` sits below the list. On small viewports, scroll it into view above `navigation "Mobile primary"`.
- Past or closed days are read-only. Checking off there is a no-op by design.
