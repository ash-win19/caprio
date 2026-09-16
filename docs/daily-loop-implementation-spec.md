# Superseded capacity and carry behavior

As of September 16, estimates are informational and unchecked tasks carry forward automatically. The original strict capacity and explicit repeated-carry requirements below are historical. See [daily-workflow.md](daily-workflow.md) for the current contract.

Daily loop implementation spec, September 14, 2026

Implement the five remaining coding tasks against merged main `e5e53a4`. Preserve React → Go → Mastra, explicit confirmation of chat proposals, immutable closed days, and one calendar day per explicit carry. This work uses the schema through migration 9; no new migration is required.

1. Confirmation and morning routing

- Only persisted workflow state establishes whether a day is confirmed. Remove the inference that a nonempty task list makes a planning day active.
- A carry-only or manually populated unconfirmed day stays `planning`; an empty confirmed day stays `active`.
- Opening the app goes to the oldest unresolved earlier day, otherwise Today for an active or closed current day, otherwise Plan. Direct links to historical days remain usable.
- Carries remain visible on Today before confirmation. Manual tasks remain reviewable without falsely claiming that a chat plan was confirmed.
- Validate the backend sequence: close day N with a carry, GET day N+1 returns planning and the carried task, confirm N+1, GET returns active. Test empty confirmed plans and task-only days.

2. Recovery after missed days

- Add `oldestUnclosedDate` to workflow responses. Find the earliest date before the requested local date with persisted active state or saved planned/completed tasks; exclude closed days, inbox/dropped tasks, empty drafts, future days, and other accounts.
- AuthGuard and the sidebar use that date instead of only checking yesterday. A failed workflow lookup offers retry instead of choosing a possibly wrong route.
- Review allows any selected nonclosed date through local today with saved tasks or active state. Future reviews remain unavailable.
- Historical Review identifies the selected date and the exact next calendar date. Tomorrow always means selected date + 1. No bulk move or automatic skipping of dates.
- After closing, the summary links through Review for an earlier next date and through Plan for today/future. Refresh workflow discovery after mutations.
- A carry invalidates an existing destination proposal within the same transaction; preserve the destination's planning/active state. A closed destination still rejects the complete transaction.
- Validate weekend recovery through multiple explicit hops, manual/carry-only dates without plan rows, empty active days, account isolation, closed-day exclusion, and rollback when the destination is closed.

3. Actionable validation errors

- Preserve the underlying validation error from model parsing. Return a stable code with a safe message in both JSON errors and SSE error events.
- Use the canonical workflow codes `plan_incomplete`, `over_capacity`, `validation`, `conflict`, `model_unavailable`, `not_found`, and `internal`. Authentication remains separate HTTP 401/403 handling with `auth` as the client-side expired-session category. Known capacity messages state the proposed and available minutes. Preserve existing HTTP semantics and message fields.
- Extend the frontend ApiError with an optional code and use it before legacy text matching. User capacity errors do not trigger provider fallback.
- A rejected model reply commits no messages, draft, task change, or request record. Existing saved state and retryable input remain intact.
- Validate omitted tasks, over-capacity, malformed JSON, direct confirm capacity rejection, JSON responses, SSE after partial output, and frontend rendering/transport of codes.

4. Baseline success events

- Emit structured `plan_confirmed`, `day_closed`, and `tasks_carried` logs after the transaction commits. Include internal account ID, local plan date, workflow version, task count, and proposal ID or review session ID. Carry includes destination date and count.
- Emit only for a new successful transition. Idempotent replays, stale requests, failures, and rolled-back carries emit no success events. Emit tasks_carried only for positive carry count.
- Logs are best effort. They do not promise durable exactly-once delivery across a process crash; no outbox or analytics platform is added.
- Validate repeated/concurrent requests, rollback, counts, and that task titles, notes, messages, and credentials are absent from event payloads.

5. Carry language and archived task history

- Keep the warning and highlighted Drop choice for an already carried unfinished task. Explain that another carry requires another explicit choice; do not imply automatic deletion or a lifetime carry limit.
- Remove the closed-destination error's nonexistent reopen instruction.
- Show archived task names grouped by Done, Carried to the actual date, and Dropped in closed-day summaries. Classify by the archived task outcome, not current live task state or historical carry count.
- Add `taskDetailsAvailable` to distinguish legacy closed days without snapshots. Return no live tasks as historical detail for those days and show a truthful unavailable-detail message while retaining saved totals.
- Validate a carried task later completed/renamed, a previously carried task now dropped, legacy closed rows without snapshots, empty closed days, and all summary links.

Validation and delivery

- Reproduce the discovered failures with focused backend/database and UI regression tests before implementation. Source inspection already narrowed the causes, so broad speculative debugging is unnecessary.
- Run Go tests against an isolated migrated PostgreSQL database, frontend tests, lint, TypeScript checks, production builds, and Mastra contract checks as available in CI.
- Review the complete diff and record actual validation results here. Keep production smoke and the user's real ten-day trial explicitly separate from automated results.
- Deliver the tested development SQL script and the implementation with source research in `docs/daily-loop-implementation-research.md`. Do not apply user-run scripts to Neon as part of coding.

Status: all five coding tasks are integrated with the page-layout changes from PR #45 on `codex/daily-loop-release`. Backend race tests, frontend unit tests, builds, and planner verification passed after integration. Browser layout validation is recorded in the release notes below. The original September 14 results are retained for context.

Recorded validation, September 14, 2026:

| Check | Result |
| --- | --- |
| Development SQL | Applied the complete script to an isolated PostgreSQL 16 database at version 6. Verified versions 7–9, the capacity column, existing-account onboarding backfill, new-account default, and historical closed-review backfill. A second run rejected the already-migrated schema without changes. |
| Backend | `go test ./... -count=1` passed with `TEST_DATABASE_URL` set to the isolated database; integration tests ran. `go vet ./...` and `go build -o /dev/null ./cmd/api` passed. |
| Concurrency | `go test -race ./internal/services/chat ./internal/http/handlers -count=1` passed against the same database. Simultaneous confirmation/close retries emitted one event per transition; a separate connection observed committed state when each event was emitted. |
| Frontend | 101 tests across 15 files passed with `npm test -- --maxWorkers=2`. TypeScript and production build passed. Lint passed with 15 existing warnings and no errors. |
| Mastra | Typecheck, production build, and `npm run verify:planner` passed. The build needed network access to install its generated output dependencies. |
| Diff | Reviewed the final implementation and regression tests; `git diff --check` passed. |

The first unrestricted frontend test run hit an existing animation-dependent assertion under CPU contention. That test passed in focused runs and in the final complete suite with two workers; no animation behavior was changed. The frontend build still reports its existing bundle-size and stale Browserslist-data warnings.

Development migration handoff:

1. In Neon SQL Editor select Caprio project `blue-field-71616499`, development branch `br-flat-brook-amz21gr0`, database `neondb`.
2. Run the entire [development script](../scripts/migrate-development-7-through-9.sql). It contains only the forward migrations, runs in one transaction, and records versions 7, 8, and 9 in the Goose ledger. It expects the version-6 schema verified during research and rejects partial or already-migrated schemas.
3. Confirm the final output lists 7, 8, and 9 with `is_applied = true` and the workflow-column query succeeds. No additional migration is needed for these coding changes.

The user applied the development script. Read-only verification on September 15 confirmed versions 7–9, the workflow tables, and the capacity column. For release, release the frontend and Go backend together, then run the authenticated Plan → Confirm → Today → Review → carry/history smoke from `docs/day-of-caprio.md`, including a new local morning and missed-day recovery. Production runtime smoke, live provider/microphone checks, and the ten-real-day trial remain deployment acceptance work; local tests do not establish those outcomes.

Release integration, September 15, 2026:

- Integrated with `b403e49`, preserving PR #45's shared Page/PageHeader layout and the daily-loop Review action.
- `go test -race ./... -count=1`, `go vet ./...`, and backend build passed against isolated PostgreSQL 16. The first attempt used a mismatched local port; correcting the test server port resolved it.
- All 101 frontend unit tests passed, as did lint with the existing 15 warnings, TypeScript, and production build. Mastra typecheck, build, and planner verification passed.
- Browser layout tests initially sampled geometry in separate animation frames, producing half-pixel alignment failures. The assertions now sample each pair in one frame and wait for the expected alignment while preserving the original tolerances.
- No new database migration is required. Production and development were already reconciled through version 9 before this release.

- Final integrated Chromium layout/interaction run: all 15 tests passed. Lint and TypeScript also passed after the assertion change.
