# History

History (`/momentum`, titled "History") lists the user's saved days with their outcomes: a "Last 7 days" strip (Closed, Done, Carried, and Dropped counts) and a searchable "Saved days" list. Each day links to its Today page and its planning conversation.

## Sub-features

- `history-week`: `region "Last 7 days"`. It shows counts once a day is closed, and otherwise "No closed days yet. Close a day to see its outcomes here."
- `history-list`: `list "Saved days"`, with one `li` per day showing the date heading, the title, an outcome line ("Day still open" or "Planning in progress" when not closed), and `link "View day for <date>"`.
- `history-search`: `searchbox "Search history by date or title"` filters the list. With no match it shows "No days match your search." and `Clear search`.
- `history-conversation`: a day's `Conversation` disclosure ("N messages") with `Open conversation` (`/new?date=<day>`).
- `history-empty`: with no sessions, "Your days will appear here" and `Plan day`.

## How to get to it (user POV)

- `History` in `navigation "Primary"`.
- `View history` on a closed day's summary.
- `View history` on Today's empty state for a past day.

## Driving it with control-caprio

Preconditions:

- A stack run with `DOCTOR OK`, signed in with `enterAsDemoUser(page)`, and at least one day with a session. Closing today in Review is enough, and `../drives/day-loop.stack.spec.ts` does it.
- For list or search layouts without a backend, a mock run. `mockDay` answers `/api/chat/sessions` with one day, "A focused day".

- **Open History.** Run `await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'History' }).click()`. The URL ends with `/momentum` and `heading "History"` is visible.
- **Week strip.** `page.getByRole('region', { name: 'Last 7 days' })` contains `Closed`, with a count of at least 1 after a closed day.
- **Saved day.** `page.getByRole('list', { name: 'Saved days' }).getByRole('link', { name: /^View day for / })` has a count of at least 1. Clicking it opens `/today?date=<day>`.
- **Search.** Run `await page.getByRole('searchbox', { name: 'Search history by date or title' }).fill('zzzz')`. "No days match your search." appears, and `Clear search` restores the list.
- **Proof.** `$C drive .cursor/skills/verify-caprio/drives/day-loop.stack.spec.ts` saves `04-history.png/.aria.yml`.

## Gotchas

- History is built from chat sessions (`/api/chat/sessions`), so a day appears once it has a plan or conversation record. A brand-new account shows the empty state.
- Date labels are locale-formatted ("Tuesday, October 6"). Match `View day for` links by prefix or regex, not by the exact date string.
