package handlers_test

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ashwinshanmugam/caprio/backend/internal/db"
	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/ashwinshanmugam/caprio/backend/internal/http/handlers"
)

// setupLeftoverTest creates a test server for leftover tests.
func setupLeftoverTest(t *testing.T) (*httptest.Server, *db.Store, uuid.UUID) {
	t.Helper()

	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://caprio:caprio@localhost:5432/caprio"
	}

	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		t.Skipf("skipping: cannot connect to test database: %v", err)
	}

	if err := pool.Ping(context.Background()); err != nil {
		pool.Close()
		t.Skipf("skipping: cannot ping test database: %v", err)
	}

	store := db.NewStore(pool)

	testEmail := fmt.Sprintf("test-%s@caprio.app", uuid.New().String()[:8])
	user, err := store.Queries.CreateUser(context.Background(), generated.CreateUserParams{
		Email:        testEmail,
		Name:         "Test User",
		PasswordHash: "testhash",
	})
	require.NoError(t, err)

	gin.SetMode(gin.TestMode)
	r := gin.New()

	r.Use(func(c *gin.Context) {
		c.Set("user_id", user.ID)
		c.Next()
	})

	handler := handlers.NewDayHandler(store)
	r.GET("/api/day/leftovers", handler.GetLeftovers)

	ts := httptest.NewServer(r)

	t.Cleanup(func() {
		ts.Close()
		pool.Close()
	})

	return ts, store, user.ID
}

// TestLeftovers_OneHopCarryRule verifies the one-hop leftover rule:
// - Unchecked tasks from yesterday appear as leftovers
// - They are marked as carried over
func TestLeftovers_OneHopCarryRule(t *testing.T) {
	ts, store, userID := setupLeftoverTest(t)

	yesterday := time.Now().AddDate(0, 0, -1).Truncate(24 * time.Hour)
	yesterdayPg := pgtype.Date{Time: yesterday, Valid: true}

	// Create an unchecked task from yesterday.
	task, err := store.Queries.CreateTask(context.Background(), generated.CreateTaskParams{
		UserID:         userID,
		Title:          "Yesterday's unchecked task",
		Urgency:        generated.UrgencyLevelMedium,
		Source:         generated.TaskSourceManual,
		SortOrder:      0,
		PlannedForDate: yesterdayPg,
		Status:         generated.TaskStatusPlanned,
	})
	require.NoError(t, err)

	// Get leftovers.
	resp, err := http.Get(ts.URL + "/api/day/leftovers")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	result := parseResponse(t, resp)
	leftovers, ok := result["leftovers"].([]interface{})
	require.True(t, ok)

	// Should have exactly one leftover.
	assert.Len(t, leftovers, 1)

	leftover := leftovers[0].(map[string]interface{})
	assert.Equal(t, task.ID.String(), leftover["id"])
	assert.Equal(t, "Yesterday's unchecked task", leftover["title"])

	// Verify task was marked as carried over.
	updatedTask, err := store.Queries.GetTaskByID(context.Background(), generated.GetTaskByIDParams{
		ID:     task.ID,
		UserID: userID,
	})
	require.NoError(t, err)
	assert.True(t, updatedTask.CarriedOver)
	assert.Equal(t, generated.TaskSourceCarried, updatedTask.Source)
}

// TestLeftovers_CompletedTasksNotIncluded verifies that completed tasks from
// yesterday don't appear as leftovers.
func TestLeftovers_CompletedTasksNotIncluded(t *testing.T) {
	ts, store, userID := setupLeftoverTest(t)

	yesterday := time.Now().AddDate(0, 0, -1).Truncate(24 * time.Hour)
	yesterdayPg := pgtype.Date{Time: yesterday, Valid: true}

	// Create a completed task from yesterday.
	_, err := store.Queries.CreateTask(context.Background(), generated.CreateTaskParams{
		UserID:         userID,
		Title:          "Yesterday's completed task",
		Urgency:        generated.UrgencyLevelMedium,
		Source:         generated.TaskSourceManual,
		SortOrder:      0,
		PlannedForDate: yesterdayPg,
		Status:         generated.TaskStatusCompleted,
	})
	require.NoError(t, err)

	resp, err := http.Get(ts.URL + "/api/day/leftovers")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	result := parseResponse(t, resp)
	leftovers, ok := result["leftovers"].([]interface{})
	require.True(t, ok)

	// Should have no leftovers.
	assert.Len(t, leftovers, 0)
}

// TestLeftovers_OnlyYesterdayIncluded verifies that tasks from 2+ days ago
// don't appear as leftovers (one-hop rule).
func TestLeftovers_OnlyYesterdayIncluded(t *testing.T) {
	ts, store, userID := setupLeftoverTest(t)

	twoDaysAgo := time.Now().AddDate(0, 0, -2).Truncate(24 * time.Hour)
	twoDaysAgoPg := pgtype.Date{Time: twoDaysAgo, Valid: true}

	// Create an unchecked task from two days ago.
	_, err := store.Queries.CreateTask(context.Background(), generated.CreateTaskParams{
		UserID:         userID,
		Title:          "Two days ago task",
		Urgency:        generated.UrgencyLevelMedium,
		Source:         generated.TaskSourceManual,
		SortOrder:      0,
		PlannedForDate: twoDaysAgoPg,
		Status:         generated.TaskStatusPlanned,
	})
	require.NoError(t, err)

	resp, err := http.Get(ts.URL + "/api/day/leftovers")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	result := parseResponse(t, resp)
	leftovers, ok := result["leftovers"].([]interface{})
	require.True(t, ok)

	// Should have no leftovers (two days ago is beyond one-hop).
	assert.Len(t, leftovers, 0)
}
