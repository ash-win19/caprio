# Caprio verification map

This directory is the maintained source for verifying Caprio's user-facing behavior. Read this index before driving the app, then use the matching feature file as the recipe. Commands assume `C=.cursor/skills/verify-caprio/bin/control-caprio` from the repo root (see `../SKILL.md`).

## Baseline preconditions

- Start a run with `$C up` (stack: Vite + Go API with dev-bypass auth + throwaway Postgres) or `$C up --mode mock` (Vite only, API answered in the browser).
- Require `DOCTOR OK` from `$C doctor`. It confirms the URLs, the pids owning the ports, the throwaway `DATABASE_URL`, empty `AUTH0_DOMAIN`, and the migration version.
- Stack runs start with an empty database. The first drive signs in through Login → "Continue as demo user →" and finishes onboarding (pick `Work` and `Gym`, then `Continue →`, then `Plan my day`). After that, everything belongs to `dev@caprio.app` in this run's database.
- Mock runs seed state per spec with `mockDay(page, …)` from `frontend/e2e/fixtures/day.ts`. The browser clock is pinned to 2026-09-14 12:00 local.
- Never drive an instance that this verification run did not start, and never point a run at production, Neon, or Auth0.

## Driving conventions

- Write or reuse a spec in `../drives/` and run it with `$C drive <spec>`. Helpers come from `../drives/lib/caprio.ts`.
- Prefer ARIA roles and accessible names (listed per feature) over CSS or DOM position.
- Navigate the way a user does: `navigation "Primary"` links (`Today`, `Plan`, `Inbox`, `Review …`, `History`), page buttons, and the `View tasks` link. Use `page.goto` only for routes a link would open, such as `/today?date=<localDay>`.
- Use titles containing the run id (`env.run`) so assertions only see rows this drive created.
- Treat quoted names as literal. Several contain typographic apostrophes (`’`) or arrows (`→`). Match those with a regex when unsure.

## Proof and skip reporting

- Capture the action and the resulting state with `proof(page, 'NN-step')`, which saves a screenshot and an ARIA snapshot to the evidence dir.
- In stack mode, a mutation proof includes a read-only `sql(query, 'NN-db-*.txt')` of the stored row and a second UI view (reload or another page).
- In mock mode, the proof includes the request bodies the UI sent (`saveEvidence('*-writes.json', …)`). Mock mode does not prove the Go API or the database. Say so.
- Record the feature ID, the mode, and the entry point with every report. `drive.log` ends with the run id and commit.
- Report an unreachable path with the attempted command and the unmet precondition. For example: planning chat in stack mode returns 503 because no Mastra/`GROQ_API_KEY` is available locally.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections, in this order: `Sub-features` (short IDs, one line each), `How to get to it (user POV)` (every entry point), `Driving it with control-caprio` (starts with `Preconditions:`, then labeled bullets pairing each user action with the exact Playwright call and the observable result), and `Gotchas`.

## Features

| Feature | Modes | Shipped spec | Last proven |
|---|---|---|---|
| [Plan the day](./plan-day.md): composer → draft plan → Confirm / Discard | mock (full), stack (unavailable path only; 503 observed in an exploratory drive) | `plan-day.mock.spec.ts` | 2026-10-06 at 7279f1d, mock run, 2/2 passed |
| [Inbox](./inbox.md): capture now, add to today later | stack | `inbox-capture.stack.spec.ts` | 2026-10-06 at 7279f1d, stack run, passed (skill acceptance drive) |
| [Today checklist](./today.md): check off, reorder, carried forward | stack (check-off), mock (carried forward) | `day-loop.stack.spec.ts` (check-off only) | 2026-10-06 at 7279f1d, stack run, check-off passed; reorder and carried forward not yet driven by this skill |
| [Review](./review.md): resolve unfinished tasks, close the day | stack | `day-loop.stack.spec.ts` | 2026-10-06 at 7279f1d, stack run, close passed; per-task outcomes and reflection not yet driven |
| [History](./history.md): closed days and their outcomes | stack | `day-loop.stack.spec.ts` | 2026-10-06 at 7279f1d, stack run, list passed; search not yet driven |
