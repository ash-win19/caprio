# Daily-loop implementation research

Researched on 2026-09-14 against merged commit `e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc`. This is the recommended implementation contract for the five coding tasks after the database repair. Findings below come from the merged source snapshot and official technical documentation. Validation cases describe work to run, not checks already passed.

## 1. Confirmation state and morning routing

The workflow loader currently changes the returned state from `planning` to `active` whenever the task list is nonempty. It does not persist that change. Confirmation already explicitly writes `state='active'`, so the loader is erasing a useful distinction that the database stores correctly. A carry or a manually added task is saved work, but it is not evidence that the user confirmed a daily plan. [Workflow loader and confirmation](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/backend/internal/services/chat/service.go)

Implement these rules:

- Return persisted `daily_plans.state`. If the row does not exist, return `planning`, even when tasks exist. Remove the task-count inference.
- Keep the current three public state values. `planning` means the day has not been confirmed, `active` means it has been confirmed, and `closed` means its review is immutable.
- A carry-created day remains `planning` until explicit confirmation. A subsequent proposal on an already active day does not erase its confirmed state.
- After any required earlier review, the first morning landing opens `/new` for a planning day and `/today` for an active day. A closed current day should open its summary rather than invite a new plan.
- A direct visit to Today still displays saved carries and manual tasks, along with the existing invitation to plan available time and priorities. Do not hide tasks because their day is unconfirmed.
- Preserve manual task completion and ordering, which are existing explicit user actions. They do not become implicit plan confirmation.
- Allow review of a nonclosed day at or before local today when it is active **or has saved tasks**. Otherwise removal of the state inference strands manual task-created days and old carry-only days. A planning day with no tasks still directs the user to Plan.

The last rule is a deliberate product compatibility decision. Review saves outcomes for existing work; it does not approve an AI proposal. Today and Review currently use active state as a proxy for both concepts, so both pages need the same distinction. [Today controls](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/frontend/src/pages/Today.tsx), [Review eligibility](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/frontend/src/pages/Review.tsx)

Validate a blank day, manual tasks without a daily-plan row, carry-only tasks, an active empty plan, active work with a revision pending, and a closed day. For each, assert both API state and the first-open route. Complete the sequence of closing one day with a carry, refreshing the next day, inspecting the visible task, confirming the next plan, and refreshing again. The state must change only at confirmation.

## 2. Recovery after multiple missed days

AuthGuard currently reads only today and yesterday. Review permits only today or an active yesterday. Friday work therefore has no closeout path when the user returns on Monday. The history sessions query is not a sufficient recovery index: it includes only dates in `daily_plans` and `chat_messages`, and caps results at 90. A carry-only or manually created day may appear in neither table. [AuthGuard](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/frontend/src/components/AuthGuard.tsx), [session query](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/backend/internal/db/queries/chat_messages.sql)

Add an account-scoped recovery date to the bootstrap or workflow response, for example `oldestUnclosedDate: string | null`. Query the earliest date before the client-supplied local today that has either a persisted active plan or saved tasks with status `planned` or `completed`. Exclude a date whose daily plan is closed. Include completed-only days because their outcomes still need review. Include an explicitly confirmed empty day. Exclude empty planning conversations, backlog-only dates, dropped-only dates, and future dates. Compute this from the database rather than making one request per historical day.

Use the recovery date instead of yesterday-only routing. The public entry routes and today's Plan/Today routes should lead to that review. Leave Settings, Capture, History, and deliberately selected historical routes usable. A recovery-query failure must display a retryable loading error rather than silently treating missing data as no recovery. Invalidate recovery data after task changes and closeout using the existing query invalidation mechanism. [Current morning routing](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/frontend/src/lib/homePath.ts), [query invalidation](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/frontend/src/lib/queries.ts)

Keep the one-calendar-day carry contract. The backend already computes `nextDate` using the selected review date plus one calendar day. Reviewing Friday on Monday and choosing Tomorrow therefore moves the task to Saturday. Show the actual destination date next to the carry action and in its confirmation summary. After closeout, offer the next unresolved review. Advancing Saturday to Sunday and Sunday to Monday requires another explicit review choice each time. Do not automatically move all overdue tasks to Monday, skip weekends, manufacture reviews, or mark a destination plan confirmed. [Close transaction](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/backend/internal/services/chat/close.go)

This can require several reviews after an absence. That cost follows from the existing carry rule; changing it to a direct move to today would be a separate product decision. The UI must make the date sequence clear so users can choose Done or Drop instead of repeatedly carrying work they no longer want.

If the next calendar day is already closed, reject the whole source-day close transaction when it includes a carry. Keep Done and Drop available and explain the exact closed destination date. Do not suggest reopening that day, because no reopen operation exists. Invalidate any open destination proposal when carrying changes its task list, within the same transaction. Preserve the destination's established state: an active destination stays active, while a new destination stays planning. The current task snapshot check already rejects stale confirmation, but explicitly clearing the changed destination draft prevents showing a proposal that can no longer be accepted. [Close transaction](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/backend/internal/services/chat/close.go), [confirmation snapshot check](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/backend/internal/services/chat/service.go)

Validate these cases against an isolated migrated database:

- Friday remains unresolved on Monday and is found even without a daily-plan row.
- Friday's carry lands on Saturday, remains unconfirmed, and becomes the next recoverable date.
- Two older days return in date order; empty drafts never block recovery.
- Done and Drop do not create a new carry date. Completed-only work can be reviewed.
- A closed next day rejects the full transaction without moving other tasks, saving a partial review, or emitting success events.
- Refreshing or retrying closeout does not duplicate carry counts or reviews.
- Account A never sees Account B's old dates. Dates around month/year boundaries and a daylight-saving transition still move one calendar date.

## 3. Typed validation errors through JSON and streaming

`ParseAgentReply` returns `ValidationError`, but `ProcessStream` wraps it using `%v`. The handler's `errors.As` check then fails, turning an incomplete model proposal into a generic 500. `%w` preserves the error for `errors.As`; this is documented behavior of Go's error wrapping. [Service wrapper](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/backend/internal/services/chat/service.go), [Go error wrapping](https://go.dev/blog/go1.13-errors)

Preserve the typed cause and add stable, additive error codes. Keep the existing JSON `error` message and existing status conventions, so old clients continue to work. Recommended codes are `plan_incomplete`, `plan_over_capacity`, `invalid_plan`, `validation_error`, `plan_conflict`, `day_closed`, `model_capacity`, and `model_unavailable`. Existing request-authentication errors can remain compatible through HTTP 401/403, with an optional `unauthorized` code.

Use the same mapper for ordinary JSON errors and stream errors. Before the first delta, return the mapped HTTP status and `{ error, code }`. After streaming starts, send one `error` event with `{ error, code, status }` and no `done` event. The HTTP stream has already started successfully, so the status belongs in the event body. Keep named events and the existing `text/event-stream` format. [Current handler contract](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/backend/internal/http/handlers/chat.go), [HTML server-sent events specification](https://html.spec.whatwg.org/multipage/server-sent-events.html)

Extend `ApiError` with an optional code, preserving existing two-argument calls. Parse it in both ordinary HTTP failures and streaming failures. Prefer the code when choosing copy and fallback behavior; retain status/message handling for responses from an older backend. An over-capacity daily plan is a validation failure, while provider capacity is an outage. Do not route a schedule error through Groq fallback merely because its code or text includes the word capacity. [API client](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/frontend/src/lib/api.ts), [fallback classifier](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/frontend/src/lib/chat-resilience.ts)

For incomplete proposals, explain that every unfinished task needs to be included or explicitly deferred. For over-capacity proposals, explain that the tasks exceed available time and ask for fewer tasks or more time. Preserve the user's editable input. Neither error may persist chat messages, a request replay record, a proposal, or task changes. Unknown database/provider errors must retain generic public messages rather than exposing internal details. [Validation and persistence order](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/backend/internal/services/chat/service.go)

Validate malformed JSON, omitted tasks, duplicate/foreign task IDs, excess planned time, a stale confirmation, authentication expiry, provider timeout, and unknown internal errors. Exercise both no-delta JSON failure and partial-text SSE failure. Assert the same code, appropriate status, no saved changes, no final success event, recoverable composer input, and no fallback for plan validation.

## 4. Success events after commit

`WithUserTx` serializes an account's workflow mutations with a transaction-scoped advisory lock and returns the result of `Commit`. Confirmation already detects a repeated confirmed proposal ID; closeout already returns the stored review when the day is closed. Keep those database decisions as the source of retry deduplication. [Transaction wrapper](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/backend/internal/db/store.go), [PostgreSQL transaction-level advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS)

Record whether the current call performed a fresh state change inside the transaction. Emit structured events only after `WithUserTx` returns nil and that flag is true. Use the existing `slog` logging approach; the standard library supports named attributes without adding an analytics service. [Existing workflow logging](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/backend/internal/http/handlers/chat.go), [slog documentation](https://pkg.go.dev/log/slog)

| Event | Trigger | Required fields |
| --- | --- | --- |
| `plan_confirmed` | A fresh proposal confirmation commits | user ID, selected local date, proposal ID, saved day task count |
| `day_closed` | A fresh review commits | user ID, selected local date, standup/review ID, completed count, carried count, dropped count |
| `tasks_carried` | That closeout commits with carried count above zero | user ID, source date, destination date, standup/review ID, count |

Use stable identifiers for correlation, such as the proposal ID or review ID plus event name. Do not log task titles, notes, messages, authentication tokens, or connection strings. A revision confirmation is a new event for its new proposal ID. A retry of the same confirmation or already closed day emits nothing. A closeout with no carries emits `day_closed` only.

These are best-effort operational logs with retry deduplication. A process can die after database commit and before emitting a log, and a logging failure cannot roll back committed work. Do not claim durable exactly-once analytics. A transactionally stored outbox would require additional schema and delivery work; it is unnecessary for this baseline unless durable audit delivery becomes a requirement.

Validate fresh success, identical sequential retry, concurrent retries, stale/conflicting confirmation, invalid closeout, destination-day conflict, zero carries, and rollback after an earlier task update. Capture emitted records in tests and verify counts and dates. The event callback/logger must run after committed rows can be read, never while the transaction is still open.

## 5. Truthful carry copy and archived task history

The SQL allows every explicit Tomorrow action to move a task one calendar day and increment `defer_count`. There is no lifetime limit at two carries. The current warning claims a third carry cannot happen and says skipped work disappears, which is inconsistent with stored tasks remaining on unresolved dates. Also, `defer_count` can increase through the separate defer-to-backlog operation, so it is not an exact count of calendar-day carries. [Task SQL](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/backend/internal/db/queries/tasks.sql), [current review text](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/frontend/src/pages/Review.tsx)

Keep a warning and a deliberate choice for previously postponed work, but use accurate wording: "You've postponed this task before. Choose Tomorrow only if you intend to do it then, or Drop to remove it from your plan." Explain that Tomorrow moves to the following calendar date and another move needs another explicit review choice. Work is not automatically dropped because the user misses a day. Use exact destination dates for historical reviews and summaries.

Modern closeout already stores immutable `closed_tasks` JSON. Render names from that archive under Done, Tomorrow, and Drop. Classify completed status or the completed flag as Done first, dropped status as Drop next, and the remaining archived planned task moved to the following date as Tomorrow. A previously carried task that is now completed must appear under Done. Show all groups and make empty groups understandable. Keep notes, energy where displayed, and existing numeric totals. [Archive creation](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/backend/internal/services/chat/close.go), [current summary](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/frontend/src/components/workflow/WorkflowUI.tsx)

Migration 8 backfilled closed reviews without `closed_tasks`. Do not pretend live task records are their historical archive. Return an archive-availability flag or omit per-task data for those legacy rows, and show "Task details were not recorded for this day." Keep their recorded totals. No data migration can reconstruct original task names or actions reliably from later mutable records. [Migration 8 backfill](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/backend/internal/db/migrations/00008_daily_workflow.sql)

Validate all three outcomes together, a completed previously carried task, repeated explicit carries, empty groups, zero-task reviews, legacy rows without archives, and later title/status edits to a carried task. The old summary must keep the original name and original outcome. History must expose a usable review action for unresolved days and retain read-only summaries for closed days.

## Delivery and validation boundaries

The five changes can use the existing schema after migrations 7 through 9. Recovery metadata and error codes are additive API fields; corrected workflow state semantics require coordinated frontend/backend deployment. No task model, new provider, new calendar integration, automatic carry job, or reopening API is required. The existing migration scripts must remain unchanged.

Run the frontend unit suite, lint, TypeScript check, and production build. Run `go test ./...` with `TEST_DATABASE_URL` pointing to an isolated PostgreSQL database migrated through Goose, then `go vet ./...` and the backend build. The integration tests deliberately skip when that environment variable is absent, so a green test command without the database is incomplete evidence. Use the repository's PostgreSQL 16 and pinned Goose setup as the reference. [CI checks](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/.github/workflows/ci.yml), [integration test setup](https://github.com/ash-win19/caprio/blob/e5e53a47d2a6c2c8d1255b3f042c978f3b6860dc/backend/internal/services/chat/workflow_test.go)

After deployment, smoke Plan, Confirm, task completion, mixed-outcome Review, next-day carry visibility, morning planning, missed-day recovery, and historical names. Record deployment SHA, local dates, browser, and observed outcomes. Unit and database tests can establish deterministic behavior, but they do not prove the deployed account, provider, and database are wired correctly.
