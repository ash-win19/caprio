package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/ashwinshanmugam/caprio/backend/internal/db"
	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/ashwinshanmugam/caprio/backend/internal/http/handlers"
	"github.com/ashwinshanmugam/caprio/backend/internal/services/chat"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func setupWorkflowHTTP(t *testing.T) (*gin.Engine, *db.Store, uuid.UUID) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to an isolated migrated PostgreSQL database")
	}
	pool, err := pgxpool.New(context.Background(), url)
	require.NoError(t, err)
	require.NoError(t, pool.Ping(context.Background()))
	store := db.NewStore(pool)
	user, err := store.Queries.CreateUser(context.Background(), generated.CreateUserParams{Email: uuid.NewString() + "@workflow-http.test", Name: "Test", PasswordHash: "unused"})
	require.NoError(t, err)
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, user.ID); pool.Close() })
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set("user_id", user.ID); c.Next() })
	tasks := handlers.NewTaskHandler(store)
	r.GET("/api/tasks", tasks.List)
	r.POST("/api/tasks", tasks.Create)
	r.PATCH("/api/tasks/:id", tasks.Update)
	r.DELETE("/api/tasks/:id", tasks.Delete)
	onboarding := handlers.NewOnboardingHandler(store)
	r.POST("/api/onboarding", onboarding.Complete)
	r.PATCH("/api/settings", onboarding.UpdateSettings)
	workflow := handlers.NewChatHandler(store, chat.NewService(store, nil))
	r.GET("/api/workflow", workflow.GetWorkflow)
	bootstrap := handlers.NewBootstrapHandler(store)
	r.GET("/api/bootstrap", bootstrap.Get)
	close := handlers.NewDayCloseHandler(store)
	r.POST("/api/day/close", close.Close)
	return r, store, user.ID
}
func httpJSON(t *testing.T, r http.Handler, method, path string, body any, status int) map[string]any {
	t.Helper()
	var data []byte
	if body != nil {
		var err error
		data, err = json.Marshal(body)
		require.NoError(t, err)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")
	result := httptest.NewRecorder()
	r.ServeHTTP(result, req)
	require.Equal(t, status, result.Code, result.Body.String())
	var decoded map[string]any
	require.NoError(t, json.Unmarshal(result.Body.Bytes(), &decoded))
	return decoded
}

func TestTaskMutationKeepsCompletionConsistentAndInvalidatesProposals(t *testing.T) {
	r, store, user := setupWorkflowHTTP(t)
	ctx := context.Background()
	created := httpJSON(t, r, "POST", "/api/tasks", map[string]any{"title": "Finish report", "plannedForDate": "2026-09-06"}, 201)
	id := created["id"].(string)
	proposal := `{"id":"` + uuid.NewString() + `","summary":"Draft","availableMinutes":60,"tasks":[]}`
	_, err := store.Pool.Exec(ctx, `INSERT INTO daily_plans (user_id,plan_date,state,version,proposal,proposal_snapshot) VALUES ($1,'2026-09-06','active',1,$2,'snapshot')`, user, proposal)
	require.NoError(t, err)
	done := httpJSON(t, r, "PATCH", "/api/tasks/"+id, map[string]any{"completed": true}, 200)
	require.Equal(t, true, done["completed"])
	require.Equal(t, "completed", done["status"])
	require.NotNil(t, done["completedAt"])
	tasks := httpJSON(t, r, "GET", "/api/tasks?date=2026-09-06", nil, 200)
	require.Len(t, tasks["tasks"], 1)
	workflow := httpJSON(t, r, "GET", "/api/workflow?date=2026-09-06", nil, 200)
	require.Nil(t, workflow["proposal"])
	require.EqualValues(t, 2, workflow["version"])
	require.Equal(t, "active", workflow["state"])
	reopened := httpJSON(t, r, "PATCH", "/api/tasks/"+id, map[string]any{"completed": false}, 200)
	require.Equal(t, "planned", reopened["status"])
	require.Nil(t, reopened["completedAt"])
	httpJSON(t, r, "POST", "/api/day/close", map[string]any{"date": "2026-09-06", "taskActions": []any{}}, 400)
	current, err := store.Queries.GetTaskByID(ctx, generated.GetTaskByIDParams{ID: uuid.MustParse(id), UserID: user})
	require.NoError(t, err)
	require.Equal(t, generated.TaskStatusPlanned, current.Status)
	httpJSON(t, r, "POST", "/api/day/close", map[string]any{"date": "2026-09-06", "taskActions": []any{map[string]any{"taskId": id, "action": "done"}}}, 200)
	httpJSON(t, r, "PATCH", "/api/tasks/"+id, map[string]any{"completed": false}, 409)
	httpJSON(t, r, "POST", "/api/tasks", map[string]any{"title": "Late task", "plannedForDate": "2026-09-06"}, 409)
	captured := httpJSON(t, r, "POST", "/api/tasks", map[string]any{"title": "Inbox task", "status": "backlog", "plannedForDate": "2026-09-06"}, 201)
	inbox := httpJSON(t, r, "GET", "/api/tasks?status=backlog", nil, 200)
	require.Len(t, inbox["tasks"], 1)
	moved := httpJSON(t, r, "PATCH", "/api/tasks/"+captured["id"].(string), map[string]any{"status": "planned", "plannedForDate": "2026-09-07"}, 200)
	require.Equal(t, "2026-09-07", moved["plannedForDate"])
}

func TestOnboardingAndSettingsPreserveCategoryIdentity(t *testing.T) {
	r, store, user := setupWorkflowHTTP(t)
	first := httpJSON(t, r, "POST", "/api/onboarding", map[string]any{"preferences": map[string]any{"briefTime": "8 AM", "micSensitivity": 50}, "categories": []any{map[string]any{"id": "1", "name": "Work", "color": "#4A7CFF"}}}, 200)
	require.Equal(t, true, first["onboardingComplete"])
	categories := first["categories"].([]any)
	require.Len(t, categories, 1)
	id := categories[0].(map[string]any)["id"].(string)
	task := httpJSON(t, r, "POST", "/api/tasks", map[string]any{"title": "Prepare brief", "categoryId": id, "plannedForDate": "2026-09-06"}, 201)
	edited := httpJSON(t, r, "PATCH", "/api/settings", map[string]any{"categories": []any{map[string]any{"id": id, "name": "Client work", "color": "#4A7CFF"}}}, 200)
	require.Equal(t, id, edited["categories"].([]any)[0].(map[string]any)["id"])
	saved, err := store.Queries.GetTaskByID(context.Background(), generated.GetTaskByIDParams{ID: uuid.MustParse(task["id"].(string)), UserID: user})
	require.NoError(t, err)
	require.Equal(t, uuid.MustParse(id), *saved.CategoryID)
	httpJSON(t, r, "PATCH", "/api/settings", map[string]any{"preferences": map[string]any{"nudgeFrequency": "minimal"}}, 200)
	bootstrap := httpJSON(t, r, "GET", "/api/bootstrap?date=2026-09-06", nil, 200)
	require.Equal(t, true, bootstrap["onboardingComplete"])
	require.Len(t, bootstrap["todayTasks"], 1)
	require.Len(t, bootstrap["categories"], 1)
	httpJSON(t, r, "POST", "/api/tasks", map[string]any{"title": "Invalid category", "categoryId": uuid.NewString()}, 400)
	httpJSON(t, r, "PATCH", "/api/settings", map[string]any{"categories": []any{}}, 200)
	saved, err = store.Queries.GetTaskByID(context.Background(), generated.GetTaskByIDParams{ID: saved.ID, UserID: user})
	require.NoError(t, err)
	require.Nil(t, saved.CategoryID)
}
