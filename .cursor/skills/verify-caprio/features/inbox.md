# Inbox

Inbox (`/capture`) saves a task immediately, with no planning conversation, so it can be decided later. Saved tasks show up under "Unplanned tasks". `Add to today` puts a task on today's plan right away, or on tomorrow's once today is closed, and it then appears on the Today checklist. Each task can also be discussed in Plan or deleted.

## Sub-features

- `inbox-capture` saves a title from `form "Add an inbox task"`. The notice "Task saved to your inbox." appears and the task joins `list "Inbox tasks"` with `status = backlog`.
- `inbox-persist` keeps the captured task across a reload, as the same DB row.
- `inbox-add-to-today` handles `Add to today` (`Add to tomorrow` after today is closed). The notice "<title> added to today's plan." appears, the row leaves the inbox, and the DB has `status = planned` with `planned_for_date = <day>`. The task appears in Today's `list "Remaining tasks"`.
- `inbox-details` covers the optional category, duration (min), and urgency under the `Task details (optional)` disclosure.
- `inbox-filter` is the category select above the list ("All categories").
- `inbox-delete` is `More options for <title>` → `Delete task` → dialog "Delete this task?" → `Delete task`. The notice "Task removed from your inbox." appears.
- `inbox-discuss` is `More options for <title>` → `Discuss in Plan`, which opens `/new?…&intent=interrupt&taskId=…` with a seeded message.

## How to get to it (user POV)

- `Inbox` in `navigation "Primary"` (sidebar), or in `navigation "Mobile primary"` below 768 px.
- Direct route `/capture`.

## Driving it with control-caprio

Preconditions:

- A stack run with `DOCTOR OK`.
- The spec has signed in with `enterAsDemoUser(page)`.
- No task titled `Verify inbox <run>` exists. Check with `sql("select … where title = …") === ''`.

- **Open Inbox.** Choose Inbox in the sidebar. Run `await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Inbox' }).click()`. The URL is `/capture` and `heading "Inbox"` (level 1) is visible.
- **Capture.** Type a title and save it. Run `await page.getByRole('form', { name: 'Add an inbox task' }).getByLabel('What do you need to do?').fill(title)` and `…getByRole('button', { name: 'Add task' }).click()`. "Task saved to your inbox." appears and `list "Inbox tasks"` has a `listitem` containing the title.
- **Stored row.** Run `sql("select status, planned_for_date from tasks where title = '<title>'", '02-db-after-capture.txt')`. The result is `backlog<TAB><localDay>`.
- **Second view.** Run `await page.reload()`. The same `listitem` is visible again.
- **Add to today.** Run `await row.getByRole('button', { name: 'Add to today' }).click()`. "<title> added to today's plan." appears and the row is gone from the inbox. `sql(...)` returns `planned<TAB><localDay>`.
- **Lands on Today.** Run `await page.goto('/today?date=' + await localDay(page))`. `list "Remaining tasks"` contains the title.
- **Proof.** Run `$C drive .cursor/skills/verify-caprio/drives/inbox-capture.stack.spec.ts --name inbox-capture`. The evidence holds `01-inbox-draft`, `02-inbox-saved`, `03-inbox-added-to-today`, and `04-today-list` (each a `.png` plus `.aria.yml`), as well as `02-db-after-capture.txt` and `03-db-after-add-to-today.txt`.

## Gotchas

- `Add task` is disabled until the title is non-empty and the inbox query has loaded. Fill first, then click.
- The draft title survives navigation (`useDateDraft`). A leftover draft from an earlier step can pre-fill the field. Use `fill`, not `type`.
- Once today is closed, the button reads `Add to tomorrow` and the task gets tomorrow's date. Run Inbox drives before `day-loop.stack.spec.ts`, or in a new run.
- In stack mode, `/today` without `?date=` may bounce to `/new` (planning day). Use the dated route.
