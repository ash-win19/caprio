.PHONY: all lint typecheck test build \
       fe-lint fe-typecheck fe-test fe-build \
       be-vet be-test be-build \
       db-up db-down migrate-up migrate-down migrate-create sqlc-generate

# ── Run everything (mirrors CI) ─────────────────────────────
all: lint typecheck test build

# ── Aggregate targets ────────────────────────────────────────
lint: fe-lint be-vet
typecheck: fe-typecheck
test: fe-test be-test
build: fe-build be-build

# ── Frontend ─────────────────────────────────────────────────
fe-lint:
	cd frontend && npm run lint

fe-typecheck:
	cd frontend && npx tsc -p tsconfig.app.json --noEmit

fe-test:
	cd frontend && npm test

fe-build:
	cd frontend && npm run build

# ── Backend ──────────────────────────────────────────────────
be-vet:
	cd backend && go vet ./...

be-test:
	cd backend && go test ./...

be-build:
	cd backend && go build -o /dev/null ./cmd/api

# ── Database ─────────────────────────────────────────────────
db-up:
	docker compose up -d db

db-down:
	docker compose down

migrate-up:
	cd backend && goose -dir internal/db/migrations postgres "$(DATABASE_URL)" up

migrate-down:
	cd backend && goose -dir internal/db/migrations postgres "$(DATABASE_URL)" down

migrate-create:
	cd backend && goose -dir internal/db/migrations create $(name) sql

sqlc-generate:
	cd backend && sqlc generate
