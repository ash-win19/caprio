# Review

Review (`/review?date=<day>`) closes a day in two steps. "Review your tasks" assigns each unfinished task an outcome (Done, Tomorrow, or Drop; unfinished tasks default to Tomorrow), with already-completed tasks folded under "Already completed · N". "Confirm your day" shows the totals, an optional reflection (notes and energy), and `Close day`. Closing saves the outcomes, carries "Tomorrow" tasks forward, and shows the day summary ("Day closed").

## Sub-features

- `review-outcomes`: for each unfinished task, buttons `Done: <title>`, `Tomorrow: <title>` (or `Carry to <date>: <title>` for past days), and `Drop: <title>`, with `aria-pressed` marking the choice.
- `review-reflection`: the `Add a reflection (optional)` disclosure with `textbox "Notes for tomorrow (optional)"` and energy buttons `Drained`, `Low`, `Steady`, `High`, and `Energized`.
- `review-close`: `Continue`, then `Close day`. The page shows "Day closed" and "Your review for <weekday, month day> is saved." The DB has `daily_plans.state = 'closed'` and a new `day_reviews` row.
- `review-summary`: a closed day shows its summary (Completed, Carried forward, and Dropped counts) on `/review` and on `/today?date=<day>`.
- `review-guards`: a future day shows "This day hasn’t started yet". A day with no saved tasks shows "Start with a daily plan".

## How to get to it (user POV)

- `Review` in `navigation "Primary"`. Its accessible name includes an unfinished count, for example `Review 1 unfinished`, so match it with `/^Review/`.
- `Review day` at the bottom of Today.
- `View review` on a closed day's Today page.

## Driving it with control-caprio

Preconditions:

- A stack run with `DOCTOR OK`, signed in with `enterAsDemoUser(page)`, and today holding at least one saved task. `../drives/day-loop.stack.spec.ts` seeds one through Inbox.
- Today is not yet closed. Closing is one-way in the UI, so start a new run to repeat it.

- **Open Review.** Run `await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: /^Review/ }).click()`. The URL matches `/review` and `heading "Review your tasks"` is visible.
- **Choose outcomes.** For an unfinished task, run `await page.getByRole('button', { name: 'Drop: <title>' }).click()`. That button gets `aria-pressed="true"`.
- **Continue.** Run `await page.getByRole('button', { name: 'Continue' }).click()`. `heading "Confirm your day"` shows totals like "1 completed · 0 moving to <date> · 0 dropped".
- **Close.** Run `await page.getByRole('button', { name: 'Close day' }).click()`. "Day closed" is visible.
- **Stored state.** `sql("select state from daily_plans where plan_date = '<day>'")` returns `closed`, and `sql("select count(*) from day_reviews where plan_date = '<day>'")` returns at least 1.
- **Proof.** `$C drive .cursor/skills/verify-caprio/drives/day-loop.stack.spec.ts` saves `02-review-step1`, `03-review-closed`, `03-db-plan.txt`, and `03-db-reviews.txt`.

## Gotchas

- Outcome choices are drafts (`useDateDraft`) until `Close day`. Nothing is written before that, and leaving the page with choices made triggers the navigation lock.
- Closing today changes other features. Inbox offers `Add to tomorrow`, Today becomes read-only, and Plan shows "This day is closed."
- The nav link's name changes with the unfinished count. Never match it exactly.
