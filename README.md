# Caprio

Caprio turns a conversation about today's work and constraints into a realistic daily plan that the user reviews before saving. See [the daily workflow](docs/daily-workflow.md) for the page map, state transitions, and agent boundary.

## Mastra

The repository root contains the Mastra service used to define and manage Caprio agents. The React application remains in `frontend/`, and the Go API remains in `backend/`.

To run Mastra Studio locally:

1. Copy `.env.example` to `.env` and set `GOOGLE_GENERATIVE_AI_API_KEY`.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open `http://localhost:4111`.

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
