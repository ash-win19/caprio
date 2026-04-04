.PHONY: all lint typecheck test build \
       fe-lint fe-typecheck fe-test fe-build \
       be-vet be-test be-build

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
