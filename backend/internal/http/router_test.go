package http

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/ashwinshanmugam/caprio/backend/internal/config"
	"github.com/ashwinshanmugam/caprio/backend/internal/db"
)

// testRouter is the real router on the test database, signed in as the dev user.
func testRouter(t *testing.T) *gin.Engine {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to an isolated migrated PostgreSQL database")
	}
	pool, err := pgxpool.New(context.Background(), url)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	gin.SetMode(gin.TestMode)
	return NewRouter(config.Config{CORSAllowedOrigins: "http://localhost:5173"}, db.NewStore(pool))
}

func statusOf(r http.Handler, method, path string) int {
	result := httptest.NewRecorder()
	r.ServeHTTP(result, httptest.NewRequest(method, path, strings.NewReader("{}")))
	return result.Code
}

// Endpoints that served only removed features are gone, not just unused.
func TestRemovedEndpointsReturnNotFound(t *testing.T) {
	r := testRouter(t)
	// A real id shape, so a 404 means the route is gone, not that the task is.
	const task = "00000000-0000-4000-8000-000000000000"
	for _, endpoint := range []struct{ method, path string }{
		{"POST", "/api/onboarding"},
		{"PATCH", "/api/settings"},
		{"POST", "/api/voice-entries"},
		{"POST", "/api/tasks/reprioritize"},
		{"GET", "/api/day/2090-09-06/status"},
		{"GET", "/api/day/leftovers"},
		{"POST", "/api/tasks/" + task + "/defer"},
		{"DELETE", "/api/tasks/" + task},
		{"POST", "/api/task-changes/" + task + "/undo"},
		{"POST", "/api/chat"},
		{"GET", "/api/chat/sessions"},
	} {
		require.Equal(t, http.StatusNotFound, statusOf(r, endpoint.method, endpoint.path), "%s %s", endpoint.method, endpoint.path)
	}
	// What the app still calls is routed: these answer, even if only to refuse the empty request.
	for _, endpoint := range []struct{ method, path string }{
		{"GET", "/api/bootstrap?date=2090-09-06"},
		{"GET", "/api/workflow?date=2090-09-06"},
		{"GET", "/api/tasks?date=2090-09-06"},
		{"GET", "/api/history?before=2090-09-06"},
		{"POST", "/api/tasks/reorder"},
		{"POST", "/api/day/close"},
		{"POST", "/api/day/rollover"},
		{"POST", "/api/day/plan/confirm"},
		{"POST", "/api/day/plan/discard"},
		{"POST", "/api/chat/stream"},
	} {
		require.NotEqual(t, http.StatusNotFound, statusOf(r, endpoint.method, endpoint.path), "%s %s", endpoint.method, endpoint.path)
	}
}
