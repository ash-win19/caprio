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
	"github.com/ashwinshanmugam/caprio/backend/internal/services/chat"
)

// mockChatService is a mock implementation of the chat service for testing.
type mockChatService struct{}

func (m *mockChatService) Process(ctx context.Context, req chat.ProcessRequest) (*chat.ProcessResponse, error) {
	// Simple mock: if user says "yes", return tasks type, otherwise return confirmation.
	if len(req.Messages) > 0 {
		lastMsg := req.Messages[len(req.Messages)-1]
		if lastMsg.Role == "user" && lastMsg.Content == "yes" {
			return &chat.ProcessResponse{
				Type:    "tasks",
				Message: "Perfect! Your list is ready.",
				ProposedTasks: []chat.Task{
					{Title: "Finish the report", Duration: ptr(int32(90)), Urgency: "high"},
					{Title: "Team meeting", Duration: ptr(int32(60)), Urgency: "medium"},
				},
			}, nil
		}
	}

	return &chat.ProcessResponse{
		Type:    "confirmation",
		Message: "Got it! Here's what I'm seeing for today:\n\n1. Finish the report\n2. Team meeting\n\nDoes this look good?",
		ProposedTasks: []chat.Task{
			{Title: "Finish the report", Duration: ptr(int32(90)), Urgency: "high"},
			{Title: "Team meeting", Duration: ptr(int32(60)), Urgency: "medium"},
		},
	}, nil
}

func ptr[T any](v T) *T {
	return &v
}

// setupChatTest creates a test server for chat tests.
func setupChatTest(t *testing.T) (*httptest.Server, *db.Store, uuid.UUID) {
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

	mockService := &mockChatService{}
	handler := handlers.NewChatHandler(store, mockService)

	r.GET("/api/chat/sessions", handler.ListSessions)
	r.POST("/api/chat/:date", handler.SendMessage)
	r.POST("/api/chat/:date/confirm", handler.ConfirmTasks)

	ts := httptest.NewServer(r)

	t.Cleanup(func() {
		ts.Close()
		pool.Close()
	})

	return ts, store, user.ID
}

func TestChat_ListSessions(t *testing.T) {
	ts, store, userID := setupChatTest(t)
	ctx := context.Background()

	for _, message := range []generated.CreateChatMessageParams{
		{
			UserID:      userID,
			SessionDate: pgtype.Date{Time: time.Date(2026, time.August, 26, 0, 0, 0, 0, time.UTC), Valid: true},
			Role:        "user",
			Content:     "Plan the product launch",
		},
		{
			UserID:      userID,
			SessionDate: pgtype.Date{Time: time.Date(2026, time.August, 26, 0, 0, 0, 0, time.UTC), Valid: true},
			Role:        "assistant",
			Content:     "What time is the launch meeting?",
		},
	} {
		_, err := store.Queries.CreateChatMessage(ctx, message)
		require.NoError(t, err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, ts.URL+"/api/chat/sessions", nil)
	require.NoError(t, err)
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "no-store", resp.Header.Get("Cache-Control"))

	result := parseResponse(t, resp)
	sessions, ok := result["sessions"].([]interface{})
	require.True(t, ok)
	require.Len(t, sessions, 1)

	session, ok := sessions[0].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, "2026-08-26", session["sessionDate"])
	assert.Equal(t, "Plan the product launch", session["title"])
	assert.Equal(t, float64(2), session["messageCount"])
}

// TestChat_ConfirmGate verifies that tasks are only created after explicit confirmation.
func TestChat_ConfirmGate(t *testing.T) {
	ts, store, userID := setupChatTest(t)
	date := testDate()

	// Step 1: Send initial message
	sendBody := map[string]interface{}{
		"content": "I need to finish the report and have a team meeting",
	}
	sendJSON, _ := json.Marshal(sendBody)

	resp1, err := http.Post(ts.URL+"/api/chat/"+date, "application/json", bytes.NewReader(sendJSON))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp1.StatusCode)

	result1 := parseResponse(t, resp1)
	response1, ok := result1["response"].(map[string]interface{})
	require.True(t, ok)

	// Should receive a confirmation response.
	assert.Equal(t, "confirmation", response1["type"])

	// No tasks should be created yet.
	tasks, err := store.Queries.ListAllTasksByUserAndDate(context.Background(), generated.ListAllTasksByUserAndDateParams{
		UserID:         userID,
		PlannedForDate: pgtype.Date{Time: testDateParsed(), Valid: true},
	})
	require.NoError(t, err)
	assert.Len(t, tasks, 0, "No tasks should exist before confirmation")

	// Step 2: User says "yes"
	confirmSendBody := map[string]interface{}{
		"content": "yes",
	}
	confirmSendJSON, _ := json.Marshal(confirmSendBody)

	resp2, err := http.Post(ts.URL+"/api/chat/"+date, "application/json", bytes.NewReader(confirmSendJSON))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp2.StatusCode)

	result2 := parseResponse(t, resp2)
	response2, ok := result2["response"].(map[string]interface{})
	require.True(t, ok)

	// Should receive a tasks response.
	assert.Equal(t, "tasks", response2["type"])

	// Step 3: Explicitly confirm and create tasks
	proposedTasks := response2["proposedTasks"].([]interface{})
	require.Len(t, proposedTasks, 2)

	confirmBody := map[string]interface{}{
		"tasks": []map[string]interface{}{
			{
				"title":    "Finish the report",
				"duration": 90,
				"urgency":  "high",
			},
			{
				"title":    "Team meeting",
				"duration": 60,
				"urgency":  "medium",
			},
		},
	}
	confirmJSON, _ := json.Marshal(confirmBody)

	resp3, err := http.Post(ts.URL+"/api/chat/"+date+"/confirm", "application/json", bytes.NewReader(confirmJSON))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp3.StatusCode)

	result3 := parseResponse(t, resp3)
	createdTasks, ok := result3["tasks"].([]interface{})
	require.True(t, ok)

	// Now tasks should be created.
	assert.Len(t, createdTasks, 2)

	// Verify in DB
	dbTasks, err := store.Queries.ListAllTasksByUserAndDate(context.Background(), generated.ListAllTasksByUserAndDateParams{
		UserID:         userID,
		PlannedForDate: pgtype.Date{Time: testDateParsed(), Valid: true},
	})
	require.NoError(t, err)
	assert.Len(t, dbTasks, 2, "Two tasks should exist after confirmation")
}

func testDateParsed() time.Time {
	return time.Now().Truncate(24 * time.Hour)
}
