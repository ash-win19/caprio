---
name: verify-caprio
description: "Launch, drive, and prove Caprio (the student daily planner) in a real browser on a disposable local stack: React/Vite UI + Go API + throwaway Postgres, or Vite with browser-mocked API for the chat/plan flow. Use when you need evidence that a Caprio UI or API change works the way a user sees it (composer and draft plan on /new, Inbox, Today checklist, Review, History) before calling it done."
---

# Verify Caprio

Caprio's user surface is the React web app in `frontend/` (Vite, React Router). It talks to the Go API in `backend/` (Gin, Postgres via pgx), which forwards planning chat to the Caprio Daily Planner agent on Mastra (`src/mastra/`). Production is trycaprio.vercel.app with Auth0 and Neon. **This skill never touches production, Neon, Auth0, or a real account.**

Everything goes through one helper, `.cursor/skills/verify-caprio/bin/control-caprio` (bash, macOS/Linux). Run it from anywhere; paths resolve from the script. Shorthand below: `C=.cursor/skills/verify-caprio/bin/control-caprio`, then `$C <command>`.

Read [`features/README.md`](features/README.md) before driving anything. It indexes one recipe per user-facing feature.

## What runs locally, and what doesn't

| Piece | Local verification | Why |
|---|---|---|
| Web UI (Vite dev server) | Real | `frontend/node_modules/.bin/vite`, the binary `npm run dev` runs |
| Sign-in | Dev-mode **demo session** (Login → "Continue as demo user →") | Real Auth0 needs a browser login to Ashwin's tenant. Vite dev mode enables the demo session; the API runs with empty `AUTH0_*`, which selects `middleware.DevBypass`, so every request acts as `dev@caprio.app` |
| Go API | Real (stack mode) | Built from `backend/cmd/api` into the run's scratch dir |
| Postgres | Real, **throwaway** (stack mode) | `initdb` cluster per run on 127.0.0.1, migrated with goose. `docker-compose.yml`'s `db` service is the documented alternative, but Docker may not be running and it uses a shared named volume |
| Planning chat (Mastra agent) | **Not available.** Stack mode: `POST /api/chat/stream` returns 503 and the UI shows "Planning isn’t available right now. Please try again in a moment." | The agent's model is `groq/openai/gpt-oss-120b`; it needs `GROQ_API_KEY`, which the checkout's `.env` files do not have (the hosted agent runs on Mastra Cloud). Do not point at Mastra Cloud from a verification run |
| Draft plan → Confirm / Discard | Mock mode only | Needs a proposal, which only the agent produces. Mock mode answers `/api/**` in the browser with the repo's e2e fixture (`frontend/e2e/fixtures/day.ts`) |

If someone has a working planner agent locally, `$C up --mastra-url http://127.0.0.1:4111` passes it to the API as `MASTRA_URL`. **That path has never been exercised by this skill.** Report it as unproven until someone runs it.

## Launch

Prerequisites: `frontend/node_modules` installed (`cd frontend && npm install`; `up` checks) and Playwright's Chromium (`cd frontend && npx playwright install chromium`; the first drive fails without it). Stack mode also needs `go` plus PostgreSQL 16 binaries (`initdb`, `pg_ctl`, `createdb`, `psql`) on PATH (`up` checks). On Ashwin's Mac these come from Homebrew. The first stack launch downloads goose v3.28.0 through `go run`.

```bash
C=.cursor/skills/verify-caprio/bin/control-caprio
$C up                 # stack mode: Vite + Go API + throwaway Postgres (about 15 s warm)
$C up --mode mock     # Vite only; drive specs must answer /api/** with page.route
```

`up` prints progress on stderr and the **run id** on stdout. It returns when everything answers: Vite on `/`, and in stack mode the API on `/healthz`. Ports start at web 4180, API 18080, and Postgres 55432, and move up to the next free port, so two runs can run side by side. Read the actual values with `$C env`. Each run has:

- scratch dir `~/.cache/caprio-verify/runs/<run>/`, holding the Postgres data, API binary, logs, pids, and drive workspace. Cleanup deletes it.
- evidence dir `~/.cache/caprio-verify/evidence/<run>/`, which cleanup keeps.
- `CAPRIO_VERIFY_HOME` relocates both. `CAPRIO_VERIFY_RUN=<run>` or `--run <run>` selects a run; the default is the most recent `up`.

Safety properties that `up` enforces and `doctor` re-checks:
- The API runs from the scratch dir, so godotenv never loads `backend/.env`, which points at Neon. `DATABASE_URL` is always the throwaway cluster.
- The exported `VITE_*` values override `frontend/.env.local`, which names the real Auth0 tenant and another API URL. Auth0 gets the same placeholder values as `frontend/playwright.config.ts`.
- In mock mode, `VITE_API_BASE_URL` is the Vite origin itself, the same as the e2e config. Any `/api` call a spec forgets to route fails loudly instead of reaching a backend.
- Processes start in their own session (perl `setsid`) so they outlive the launching shell. Their pids are recorded, and only those pids and their children are ever stopped.

## Doctor

```bash
$C doctor             # read-only; prints DOCTOR OK or DOCTOR FAILED with the failing checks
```

The doctor checks that the Vite and API pids are alive and own their ports. It checks that Vite serves a bundle using this run's `VITE_API_BASE_URL` and the placeholder Auth0 domain. In stack mode it also checks that `/healthz` is ok, that the API process env has the throwaway `DATABASE_URL` (no `neon.tech`) and empty `AUTH0_DOMAIN`, that the API's cwd has no `.env`, that Postgres is alive, and that the goose version equals the newest file in `backend/internal/db/migrations/`. It also reports the commit the run was launched from and whether tracked files were dirty. Run it after `up`, and again whenever a drive fails strangely. Never drive a run that fails the doctor, and never drive an instance you did not start (for example Ashwin's own `npm run dev` on 5173).

## Drive

The harness is the repo's Playwright (`frontend/node_modules/@playwright/test`, Chromium), pointed at the run:

```bash
$C drive .cursor/skills/verify-caprio/drives/inbox-capture.stack.spec.ts   # stack run
$C drive .cursor/skills/verify-caprio/drives/day-loop.stack.spec.ts        # stack run; closes today, so run it last
$C drive .cursor/skills/verify-caprio/drives/plan-day.mock.spec.ts         # mock run
$C drive path/to/your.spec.ts --name my-check -- --headed                  # anything after -- goes to playwright
```

`drive` copies `drives/` plus your spec into the scratch dir, links `node_modules`, `src`, and `e2e` from `frontend/`, and runs `playwright test` with `drives/playwright.verify.config.ts` (1440×900, reduced motion, trace and screenshot always on). Its exit code is Playwright's.

Writing a new drive spec:
- Put it in `drives/` (`<feature>.<stack|mock>.spec.ts`) and import helpers from `'../lib/caprio'`, the repo fixture from `'../e2e/fixtures/day'`, and types from `'../src/lib/api'`.
- Start with `requireMode('stack' | 'mock')`. It fails, never skips, on the wrong kind of run.
- Stack mode: sign in with `enterAsDemoUser(page)`, which goes through Login → "Continue as demo user →" and completes onboarding through the UI on a fresh DB. Read stored state with `sql("select …")`, which is read-only (`default_transaction_read_only=on`).
- Mock mode: call `mockDay(page, {...})`, then add `page.route('**/api/**', …)` handlers for the writes you exercise. Later routes win. Fall back to `mockDay` with `route.fallback()`. `mockDay` pins the browser clock to 2026-09-14 12:00 local.
- Use ARIA roles and accessible names. The stable handles live in each feature file. Avoid CSS, except where the app has no accessible name (`.today-carried > summary`).
- Use the app's local day. `localDay(page)` returns the browser's `YYYY-MM-DD`, the same value as the app's `useLocalDay()`.

Ad-hoc checks without a spec: `$C sql "select title, status, planned_for_date from tasks"` (add `--save db/tasks.txt` to keep the output as evidence), `curl $($C env | sed -n 's/^API_URL=//p')/healthz`, and the logs in the scratch dir (`api.log` logs every request with its status, and `vite.log`).

## Evidence

Each drive writes to `~/.cache/caprio-verify/evidence/<run>/<name>/`:
- `NN-step.png` and `NN-step.aria.yml`, a full-page screenshot plus an ARIA snapshot from `proof(page, step)`. Take one after the user action and one of the resulting state.
- `NN-db-*.txt`, the query and rows from `sql(query, file)`. This is the side-effect proof in stack mode.
- `*-writes.json`, the API writes the browser sent, in mock mode.
- `drive.log` (Playwright output plus a final `drive exit=<code> spec=… run=… rev=…` line), `report.json`, and `playwright/` (traces as `trace.zip`; open one with `cd frontend && npx playwright show-trace <path>`).
- `logs/`, filled by `down`: copies of `state.env`, `vite.log`, `api.log`, `pg.log`, `migrate.log`, and the other scratch logs.

Proof standards:
- Drive the real user path: Login → demo user, navigation links, buttons. Do not use direct API calls, test-only endpoints, or localStorage edits, except `mockDay`'s session seeding in mock mode.
- Capture the action and the resulting state, not only the final screen.
- Verify side effects as well as UI: in stack mode, rows in `tasks`, `daily_plans`, and `day_reviews`, via `sql`. In mock mode, the request bodies the UI sent.
- Get a second view of every mutation: reload, or open it from another page.
- Mock mode replaces the whole API in the browser. It proves UI behavior and the request contract (for example "chat writes nothing; Confirm posts `/api/day/plan/confirm` with the proposal id"). It does not prove the Go API or the database. Say which mode a proof used.
- Report which entry point you drove. A path you could not reach (the planner without Mastra, for example) is reported as skipped, with the reason, not as verified through another path.

## Cleanup

```bash
$C down               # current run; or: $C down --run <run>
$C list               # every run, up or down, with its evidence dir
```

`down` SIGTERMs the recorded Vite and API pids and their children, escalating to SIGKILL after 5 s. It stops Postgres with `pg_ctl stop -m fast` and copies the logs into `evidence/<run>/logs/`. Then it deletes `runs/<run>/` (the DB, binary, and drive workspace) and warns if any of the run's ports are still listening. It is safe to repeat. Evidence is never deleted. Prune `~/.cache/caprio-verify/evidence/` by hand when it is no longer needed. Run `down` after every failed iteration too.

## Helpers

| File | Use |
|---|---|
| `bin/control-caprio` | `up`, `doctor`, `drive`, `sql`, `env`, `down`, `list` (see `$C help`) |
| `drives/playwright.verify.config.ts` | Playwright config used by `drive`. It refuses to run without `control-caprio`'s env |
| `drives/lib/caprio.ts` | `requireMode`, `enterAsDemoUser`, `localDay`, `sql`, `proof`, `saveEvidence`, `env` |
| `drives/inbox-capture.stack.spec.ts` | Inbox capture → persisted backlog row → Add to today → Today list (stack) |
| `drives/day-loop.stack.spec.ts` | Today check-off → Review close → History (stack, closes today) |
| `drives/plan-day.mock.spec.ts` | Composer → draft plan → Confirm / Discard contract (mock) |

The repo's own suites still apply and are not replaced by this skill: `cd frontend && npm run test:e2e`, which runs the Playwright layout and flow specs with the browser-mocked API and starts its own Vite on 4174, plus `make test` (vitest + `go test`).

## Gotchas

- The Go API binds `:PORT` on all interfaces with dev-bypass auth for the life of the run. It holds only throwaway data, but don't leave runs up.
- `/` and `/today` (without `?date=`) redirect to `/new` while today's plan is in `planning` state or this is the first visit of the day (`AuthGuard` → `DayEntry`). Use `/today?date=<localDay>`, the route the "View tasks" link opens, to reach the checklist.
- The Today checkbox is controlled by the server response. Playwright's `check()` reports "did not change its state". Use `click()` and wait on `progressbar "Tasks completed"` `aria-valuenow`.
- Inbox's "Add to today" becomes "Add to tomorrow" once today is closed. `day-loop.stack.spec.ts` closes today, so run it after the other stack specs, or start a new run.
- The demo user is shared by every spec in a run. Use titles containing the run id (`env.run`) and assert on those rows only.
- Do not run `npm run test:e2e` while relying on port 4174. Its `webServer` reuses anything already listening there.
