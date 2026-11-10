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

func status(r http.Handler, method, path string) int {
	result := httptest.NewRecorder()
	r.ServeHTTP(result, httptest.NewRequest(method, path, strings.NewReader("{}")))
	return result.Code
}

// Endpoints that served only removed features are gone, not just unused.
func TestRemovedEndpointsReturnNotFound(t *testing.T) {
	r := testRouter(t)
	for _, endpoint := range []struct{ method, path string }{
		{"POST", "/api/onboarding"},
		{"PATCH", "/api/settings"},
	} {
		require.Equal(t, http.StatusNotFound, status(r, endpoint.method, endpoint.path), "%s %s", endpoint.method, endpoint.path)
	}
	require.Equal(t, http.StatusOK, status(r, "GET", "/api/bootstrap?date=2090-09-06"), "the router still serves the app")
}
