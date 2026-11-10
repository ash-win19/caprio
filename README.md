# Caprio

Caprio turns a conversation about today's work and constraints into a realistic daily plan that the user reviews before saving. See [the daily workflow](docs/daily-workflow.md) for the page map, state transitions, and agent boundary. For a terse day-of operator script and prod smoke checklist, see [day-of Caprio](docs/day-of-caprio.md).

## Mastra

The repository root contains the Mastra service used to define and manage Caprio agents. The React application remains in `frontend/`, and the Go API remains in `backend/`.

To run Mastra Studio locally:

1. Copy `.env.example` to `.env`, set `GOOGLE_GENERATIVE_AI_API_KEY`, and set `MASTRA_DATABASE_URL` to the Neon dev database's pooled connection string.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open `http://localhost:4111`.

Mastra keeps its storage in the `mastra` schema of that Postgres database and creates its tables on first start. Only the Go backend may call the agent server. Every route except `/health` needs the `X-Caprio-Agent-Secret` header matching `AGENT_SERVER_SECRET`; the backend sends its `MASTRA_AGENT_SECRET`, and a mismatch shows up in backend logs as "planning assistant is misconfigured". The server refuses to start without the secret, except under `mastra dev`, so Studio works locally. The planner tools use a separate secret, `PLANNER_TOOL_SECRET`, for calls in the other direction.

`npm run check:server` starts the built server against a throwaway database (`CHECK_DATABASE_URL`) and checks its health, its tables, the secret on every other route, and that it refuses to start without `MASTRA_DATABASE_URL` or `AGENT_SERVER_SECRET`; CI runs it on every PR.

The Mastra platform deploys `src/mastra` from the repository root. In its GitHub setup screen, mark this repository as a monorepo and use `main` for both the server and Studio branches.

## Backend tests

`go test ./...` in `backend/` runs the unit tests on its own. The workflow and handler tests also need a migrated PostgreSQL database and skip themselves without one; CI provides it, and locally you can point them at a throwaway database:

```bash
export TEST_DATABASE_URL="postgres://localhost:5432/caprio_test?sslmode=disable"
cd backend
go run github.com/pressly/goose/v3/cmd/goose@v3.28.0 -dir internal/db/migrations postgres "$TEST_DATABASE_URL" up
go test ./...
```

Use a database nobody else is connected to: the tests create and delete their own users but share the schema.
