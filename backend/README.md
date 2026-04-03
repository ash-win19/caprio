# caprio backend

Go + Gin backend service.

## Running locally

1. Install Go (https://go.dev/)
2. Create a `.env` file (see `.env.example`)
3. Install dependencies:
   - `cd backend`
   - `go mod tidy`
4. Run:
   - `go run ./cmd/api`

## Endpoints

- `GET /healthz`
- `GET /api/tasks` (stub)

