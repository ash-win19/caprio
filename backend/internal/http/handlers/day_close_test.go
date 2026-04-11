package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
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

// testDate returns today's date string in YYYY-MM-DD format.
func testDate() string {
	return time.Now().Truncate(24 * time.Hour).Format("2006-01-02")
}

// setupDayCloseTest creates a DB-backed test server with a fake auth middleware
// that injects the given user ID. It skips the test if the database is unavailable.
func setupDayCloseTest(t *testing.T) (*httptest.Server, *db.Store, uuid.UUID) {
	t.Helper()

	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://caprio:caprio@localhost:5432/caprio"
	}

	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		t.Skipf("skipping: cannot connect to test database: %v", err)
	}

	// Verify the connection is actually usable.
	if err := pool.Ping(context.Background()); err != nil {
		pool.Close()
		t.Skipf("skipping: cannot ping test database: %v", err)
	}

	store := db.NewStore(pool)

	// Create a unique test user.
	testEmail := fmt.Sprintf("test-%s@caprio.app", uuid.New().String()[:8])
	user, err := store.Queries.CreateUser(context.Background(), generated.CreateUserParams{
		Email:        testEmail,
		Name:         "Test User",
		PasswordHash: "testhash",
	})
	require.NoError(t, err)

	gin.SetMode(gin.TestMode)
	r := gin.New()

	// Fake auth middleware injects the test user's ID.
	r.Use(func(c *gin.Context) {
		c.Set("user_id", user.ID)
		c.Next()
	})

	handler := handlers.NewDayCloseHandler(store)
	r.POST("/api/day/close", handler.Close)

	ts := httptest.NewServer(r)

	t.Cleanup(func() {
		ts.Close()
		pool.Close()
	})

	return ts, store, user.ID
}

// setupDayCloseTestNoAuth creates a server WITHOUT any auth middleware for
// testing the unauthorized path.
func setupDayCloseTestNoAuth(t *testing.T) *httptest.Server {
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

	gin.SetMode(gin.TestMode)
	r := gin.New()

	handler := handlers.NewDayCloseHandler(store)
	r.POST("/api/day/close", handler.Close)

	ts := httptest.NewServer(r)

	t.Cleanup(func() {
		ts.Close()
		pool.Close()
	})

	return ts
}

// createTestTask inserts a planned task for the given user and date.
func createTestTask(t *testing.T, store *db.Store, userID uuid.UUID, date string, title string) generated.Task {
	t.Helper()

	parsedDate, err := time.Parse("2006-01-02", date)
	require.NoError(t, err)

	task, err := store.Queries.CreateTask(context.Background(), generated.CreateTaskParams{
		UserID:         userID,
		Title:          title,
		Urgency:        generated.UrgencyLevelMedium,
		Source:         generated.TaskSourceManual,
		SortOrder:      0,
		PlannedForDate: pgtype.Date{Time: parsedDate, Valid: true},
		Status:         generated.TaskStatusPlanned,
	})
	require.NoError(t, err)

	return task
}

// dayCloseBody builds a JSON request body for the day close endpoint.
func dayCloseBody(t *testing.T, date string, actions []map[string]string) []byte {
	t.Helper()

	taskActions := make([]map[string]interface{}, len(actions))
	for i, a := range actions {
		taskActions[i] = map[string]interface{}{
			"taskId": a["taskId"],
			"action": a["action"],
		}
	}

	body := map[string]interface{}{
		"date":        date,
		"taskActions": taskActions,
	}

	b, err := json.Marshal(body)
	require.NoError(t, err)
	return b
}

// parseResponse reads the JSON response body into a map.
func parseResponse(t *testing.T, resp *http.Response) map[string]interface{} {
	t.Helper()
	defer resp.Body.Close()

	var result map[string]interface{}
	err := json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)
	return result
}

func TestDayClose_AllDone(t *testing.T) {
	ts, store, userID := setupDayCloseTest(t)
	date := testDate()

	task1 := createTestTask(t, store, userID, date, "Task 1")
	task2 := createTestTask(t, store, userID, date, "Task 2")
	task3 := createTestTask(t, store, userID, date, "Task 3")

	body := dayCloseBody(t, date, []map[string]string{
		{"taskId": task1.ID.String(), "action": "done"},
		{"taskId": task2.ID.String(), "action": "done"},
		{"taskId": task3.ID.String(), "action": "done"},
	})

	resp, err := http.Post(ts.URL+"/api/day/close", "application/json", bytes.NewReader(body))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	result := parseResponse(t, resp)

	assert.EqualValues(t, 3, result["completedCount"])
	assert.EqualValues(t, 0, result["carriedToTomorrowCount"])
	assert.EqualValues(t, 0, result["droppedCount"])

	session, ok := result["session"].(map[string]interface{})
	require.True(t, ok, "session should be a JSON object")
	assert.EqualValues(t, 3, session["tasksPlanned"])
	assert.EqualValues(t, 3, session["tasksCompleted"])

	expectedNextDate := time.Now().Truncate(24*time.Hour).AddDate(0, 0, 1).Format("2006-01-02")
	assert.Equal(t, expectedNextDate, result["nextDate"])
}

func TestDayClose_MixedActions(t *testing.T) {
	ts, store, userID := setupDayCloseTest(t)
	date := testDate()

	taskDone := createTestTask(t, store, userID, date, "Task Done")
	taskTomorrow := createTestTask(t, store, userID, date, "Task Tomorrow")
	taskDrop := createTestTask(t, store, userID, date, "Task Drop")

	body := dayCloseBody(t, date, []map[string]string{
		{"taskId": taskDone.ID.String(), "action": "done"},
		{"taskId": taskTomorrow.ID.String(), "action": "tomorrow"},
		{"taskId": taskDrop.ID.String(), "action": "drop"},
	})

	resp, err := http.Post(ts.URL+"/api/day/close", "application/json", bytes.NewReader(body))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	result := parseResponse(t, resp)

	assert.EqualValues(t, 1, result["completedCount"])
	assert.EqualValues(t, 1, result["carriedToTomorrowCount"])
	assert.EqualValues(t, 1, result["droppedCount"])

	// Verify the "tomorrow" task was moved to the next day.
	nextDate := time.Now().Truncate(24*time.Hour).AddDate(0, 0, 1).Format("2006-01-02")
	movedTask, err := store.Queries.GetTaskByID(context.Background(), generated.GetTaskByIDParams{
		ID:     taskTomorrow.ID,
		UserID: userID,
	})
	require.NoError(t, err)
	assert.Equal(t, nextDate, movedTask.PlannedForDate.Time.Format("2006-01-02"))
}

func TestDayClose_DuplicateClose(t *testing.T) {
	ts, store, userID := setupDayCloseTest(t)
	date := testDate()

	task := createTestTask(t, store, userID, date, "Task Idempotent")

	body := dayCloseBody(t, date, []map[string]string{
		{"taskId": task.ID.String(), "action": "done"},
	})

	// First call should succeed.
	resp1, err := http.Post(ts.URL+"/api/day/close", "application/json", bytes.NewReader(body))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp1.StatusCode)
	result1 := parseResponse(t, resp1)

	session1, ok := result1["session"].(map[string]interface{})
	require.True(t, ok)

	// Second call with the same date should return 200 with the same session (idempotent).
	resp2, err := http.Post(ts.URL+"/api/day/close", "application/json", bytes.NewReader(body))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp2.StatusCode)
	result2 := parseResponse(t, resp2)

	session2, ok := result2["session"].(map[string]interface{})
	require.True(t, ok)

	// The session ID should be the same.
	assert.Equal(t, session1["id"], session2["id"])
}

func TestDayClose_Unauthorized(t *testing.T) {
	ts := setupDayCloseTestNoAuth(t)

	body := []byte(`{"date":"2026-04-11","taskActions":[{"taskId":"` + uuid.New().String() + `","action":"done"}]}`)

	resp, err := http.Post(ts.URL+"/api/day/close", "application/json", bytes.NewReader(body))
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)

	result := parseResponse(t, resp)
	assert.Equal(t, "unauthorized", result["error"])
}

func TestDayClose_InvalidTaskOwnership(t *testing.T) {
	ts, store, _ := setupDayCloseTest(t)
	date := testDate()

	// Create a second user.
	otherEmail := fmt.Sprintf("other-%s@caprio.app", uuid.New().String()[:8])
	otherUser, err := store.Queries.CreateUser(context.Background(), generated.CreateUserParams{
		Email:        otherEmail,
		Name:         "Other User",
		PasswordHash: "testhash",
	})
	require.NoError(t, err)

	// Create a task owned by the other user.
	otherTask := createTestTask(t, store, otherUser.ID, date, "Other's Task")

	// The server is configured with the first user's auth. Try to close with the other user's task.
	body := dayCloseBody(t, date, []map[string]string{
		{"taskId": otherTask.ID.String(), "action": "done"},
	})

	resp, err := http.Post(ts.URL+"/api/day/close", "application/json", bytes.NewReader(body))
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	result := parseResponse(t, resp)
	errMsg, ok := result["error"].(string)
	require.True(t, ok)
	assert.Contains(t, errMsg, "not found for date")
}

func TestDayClose_InvalidAction(t *testing.T) {
	ts, store, userID := setupDayCloseTest(t)
	date := testDate()

	task := createTestTask(t, store, userID, date, "Task Invalid Action")

	body := dayCloseBody(t, date, []map[string]string{
		{"taskId": task.ID.String(), "action": "postpone"},
	})

	resp, err := http.Post(ts.URL+"/api/day/close", "application/json", bytes.NewReader(body))
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	result := parseResponse(t, resp)
	errMsg, ok := result["error"].(string)
	require.True(t, ok)
	assert.Contains(t, errMsg, `invalid action "postpone"`)
}

func TestDayClose_InvalidDate(t *testing.T) {
	ts, _, _ := setupDayCloseTest(t)

	body := []byte(`{"date":"not-a-date","taskActions":[{"taskId":"` + uuid.New().String() + `","action":"done"}]}`)

	resp, err := http.Post(ts.URL+"/api/day/close", "application/json", bytes.NewReader(body))
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	result := parseResponse(t, resp)
	errMsg, ok := result["error"].(string)
	require.True(t, ok)
	assert.Contains(t, errMsg, "invalid date format")
}
