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
	workflow := handlers.NewChatHandler(store, chat.NewService(store, nil))
	r.GET("/api/workflow", workflow.GetWorkflow)
	r.POST("/api/day/plan/confirm", workflow.Confirm)
	r.GET("/api/history", workflow.History)
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

func TestTaskMutationKeepsCompletionConsistentAndKeepsTheDraft(t *testing.T) {
	r, store, user := setupWorkflowHTTP(t)
	ctx := context.Background()
	created := httpJSON(t, r, "POST", "/api/tasks", map[string]any{"title": "Finish report", "plannedForDate": "2090-09-06"}, 201)
	id := created["id"].(string)
	draft := `{"id":"` + uuid.NewString() + `","entries":{"new:1":{"ref":"new:1","create":true,"fields":{"title":"Draft task"},"date":"2090-09-06","turns":[]}},"order":["new:1"]}`
	_, err := store.Pool.Exec(ctx, `INSERT INTO daily_plans (user_id,plan_date,state,version,draft,proposal_snapshot) VALUES ($1,'2090-09-06','active',1,$2,'snapshot')`, user, draft)
	require.NoError(t, err)
	done := httpJSON(t, r, "PATCH", "/api/tasks/"+id, map[string]any{"completed": true}, 200)
	require.Equal(t, true, done["completed"])
	require.Equal(t, "completed", done["status"])
	require.NotNil(t, done["completedAt"])
	tasks := httpJSON(t, r, "GET", "/api/tasks?date=2090-09-06", nil, 200)
	require.Len(t, tasks["tasks"], 1)
	// A direct edit saves right away and leaves the Draft waiting for Confirm.
	workflow := httpJSON(t, r, "GET", "/api/workflow?date=2090-09-06", nil, 200)
	require.NotNil(t, workflow["plan"])
	require.EqualValues(t, 1, workflow["version"])
	require.Equal(t, "active", workflow["state"])
	reopened := httpJSON(t, r, "PATCH", "/api/tasks/"+id, map[string]any{"completed": false}, 200)
	require.Equal(t, "planned", reopened["status"])
	require.Nil(t, reopened["completedAt"])
	httpJSON(t, r, "POST", "/api/day/close", map[string]any{"date": "2090-09-06", "taskActions": []any{}}, 400)
	current, err := store.Queries.GetTaskByID(ctx, generated.GetTaskByIDParams{ID: uuid.MustParse(id), UserID: user})
	require.NoError(t, err)
	require.Equal(t, generated.TaskStatusPlanned, current.Status)
	httpJSON(t, r, "POST", "/api/day/close", map[string]any{"date": "2090-09-06", "taskActions": []any{map[string]any{"taskId": id, "action": "done"}}}, 200)
	httpJSON(t, r, "PATCH", "/api/tasks/"+id, map[string]any{"completed": false}, 409)
	httpJSON(t, r, "POST", "/api/tasks", map[string]any{"title": "Late task", "plannedForDate": "2090-09-06"}, 409)
	captured := httpJSON(t, r, "POST", "/api/tasks", map[string]any{"title": "Inbox task", "status": "backlog", "plannedForDate": "2090-09-06"}, 201)
	later := httpJSON(t, r, "GET", "/api/tasks?status=later&date=2090-09-06", nil, 200)
	require.Len(t, later["tasks"], 1)
	moved := httpJSON(t, r, "PATCH", "/api/tasks/"+captured["id"].(string), map[string]any{"status": "planned", "plannedForDate": "2090-09-07"}, 200)
	require.Equal(t, "2090-09-07", moved["plannedForDate"])
}

func TestANewAccountIsUsableWithoutOnboarding(t *testing.T) {
	// The account was only just created: no onboarding, no categories.
	r, _, _ := setupWorkflowHTTP(t)
	bootstrap := httpJSON(t, r, "GET", "/api/bootstrap?date=2090-09-06", nil, 200)
	require.NotContains(t, bootstrap, "onboardingComplete", "bootstrap no longer reports onboarding")
	require.Empty(t, bootstrap["categories"])
	require.Equal(t, "Test", bootstrap["user"].(map[string]any)["name"])
	// With no categories set up, the account can plan and save tasks at once.
	httpJSON(t, r, "POST", "/api/tasks", map[string]any{"title": "Prepare brief", "plannedForDate": "2090-09-06"}, 201)
	require.Len(t, httpJSON(t, r, "GET", "/api/bootstrap?date=2090-09-06", nil, 200)["todayTasks"], 1)
	require.Equal(t, "planning", httpJSON(t, r, "GET", "/api/workflow?date=2090-09-06", nil, 200)["state"])
}

func TestConfirmNeverUndoesATaskTickedOffWhileTheDraftWaited(t *testing.T) {
	r, store, user := setupWorkflowHTTP(t)
	ctx := context.Background()
	moved := httpJSON(t, r, "POST", "/api/tasks", map[string]any{"title": "Draft moves this", "plannedForDate": "2090-09-06", "duration": 30}, 201)["id"].(string)
	edited := httpJSON(t, r, "POST", "/api/tasks", map[string]any{"title": "Draft edits this", "plannedForDate": "2090-09-06", "duration": 30}, 201)["id"].(string)
	removed := httpJSON(t, r, "POST", "/api/tasks", map[string]any{"title": "Draft removes this", "plannedForDate": "2090-09-06", "duration": 30}, 201)["id"].(string)
	reopened := httpJSON(t, r, "POST", "/api/tasks", map[string]any{"title": "Draft reopens this", "plannedForDate": "2090-09-06", "duration": 30}, 201)["id"].(string)
	draftID := uuid.NewString()
	draft := `{"id":"` + draftID + `","entries":{` +
		`"` + moved + `":{"ref":"` + moved + `","taskId":"` + moved + `","date":"2090-09-07","turns":[]},` +
		`"` + edited + `":{"ref":"` + edited + `","taskId":"` + edited + `","fields":{"duration":45},"turns":[]},` +
		`"` + removed + `":{"ref":"` + removed + `","taskId":"` + removed + `","remove":true,"turns":[]},` +
		`"` + reopened + `":{"ref":"` + reopened + `","taskId":"` + reopened + `","completed":false,"turns":[]},` +
		`"new:1":{"ref":"new:1","create":true,"fields":{"title":"Call the bank"},"date":"2090-09-06","turns":[]}},` +
		`"order":["` + moved + `","` + edited + `","` + removed + `","` + reopened + `","new:1"]}`
	_, err := store.Pool.Exec(ctx, `INSERT INTO daily_plans (user_id,plan_date,state,version,draft,proposal_snapshot) VALUES ($1,'2090-09-06','planning',1,$2,'stale')`, user, draft)
	require.NoError(t, err)
	// Every task the Draft touches is ticked off directly while it waits.
	for _, id := range []string{moved, edited, removed, reopened} {
		httpJSON(t, r, "PATCH", "/api/tasks/"+id, map[string]any{"completed": true}, 200)
	}
	workflow := httpJSON(t, r, "GET", "/api/workflow?date=2090-09-06", nil, 200)
	httpJSON(t, r, "POST", "/api/day/plan/confirm", map[string]any{"date": "2090-09-06", "draftId": draftID, "version": workflow["version"]}, 200)
	for _, id := range []string{moved, edited, removed, reopened} {
		task, err := store.Queries.GetTaskByID(ctx, generated.GetTaskByIDParams{ID: uuid.MustParse(id), UserID: user})
		require.NoError(t, err)
		require.True(t, task.Completed, task.Title)
		require.Equal(t, generated.TaskStatusCompleted, task.Status, task.Title)
		require.Equal(t, "2090-09-06", task.PlannedForDate.Time.Format("2006-01-02"), task.Title)
	}
	edit, err := store.Queries.GetTaskByID(ctx, generated.GetTaskByIDParams{ID: uuid.MustParse(edited), UserID: user})
	require.NoError(t, err)
	require.EqualValues(t, 45, *edit.Duration, "a change that leaves completion alone still applies")
	tasks := httpJSON(t, r, "GET", "/api/tasks?date=2090-09-06", nil, 200)["tasks"].([]any)
	titles := []string{}
	for _, task := range tasks {
		titles = append(titles, task.(map[string]any)["title"].(string))
	}
	require.Contains(t, titles, "Call the bank")
}

func TestHistoryEndpointListsDaysBeforeTheGivenDate(t *testing.T) {
	r, _, _ := setupWorkflowHTTP(t)
	id := httpJSON(t, r, "POST", "/api/tasks", map[string]any{"title": "Finish report", "plannedForDate": "2090-09-06"}, 201)["id"].(string)
	httpJSON(t, r, "POST", "/api/day/close", map[string]any{"date": "2090-09-06", "notes": "Report is in.", "taskActions": []any{map[string]any{"taskId": id, "action": "done"}}}, 200)
	history := httpJSON(t, r, "GET", "/api/history?before=2090-09-07", nil, 200)
	require.Equal(t, []any{map[string]any{
		"date": "2090-09-06", "wrappedUp": true, "note": "Report is in.", "taskDetailsAvailable": true,
		"done": []any{"Finish report"}, "carried": []any{}, "dropped": []any{},
		"doneCount": float64(1), "carriedCount": float64(0), "droppedCount": float64(0),
	}}, history["days"])
	require.Empty(t, httpJSON(t, r, "GET", "/api/history?before=2090-09-06", nil, 200)["days"])
	httpJSON(t, r, "GET", "/api/history", nil, 400)
	httpJSON(t, r, "GET", "/api/history?before=soon", nil, 400)
}

func TestLaterListsUndatedAndFutureTasksAndRowsMoveBetweenLaterAndToday(t *testing.T) {
	r, store, user := setupWorkflowHTTP(t)
	ctx := context.Background()
	add := func(title string, fields map[string]any) string {
		body := map[string]any{"title": title, "plannedForDate": "2090-09-06"}
		for key, value := range fields {
			body[key] = value
		}
		return httpJSON(t, r, "POST", "/api/tasks", body, 201)["id"].(string)
	}
	titles := func(path string) []string {
		out := []string{}
		for _, task := range httpJSON(t, r, "GET", path, nil, 200)["tasks"].([]any) {
			out = append(out, task.(map[string]any)["title"].(string))
		}
		return out
	}
	onToday := add("On today", nil)
	add("Friday", map[string]any{"plannedForDate": "2090-09-11"})
	add("Tomorrow, second", map[string]any{"plannedForDate": "2090-09-07", "sortOrder": 1})
	add("Tomorrow, first", map[string]any{"plannedForDate": "2090-09-07", "sortOrder": 0})
	add("Sometime, second", map[string]any{"status": "backlog", "sortOrder": 1})
	sometime := add("Sometime, first", map[string]any{"status": "backlog", "sortOrder": 0})
	dropped := add("Dropped", map[string]any{"status": "backlog"})
	httpJSON(t, r, "PATCH", "/api/tasks/"+dropped, map[string]any{"status": "dropped"}, 200)
	add("Yesterday", map[string]any{"plannedForDate": "2090-09-05"})

	// Future-dated tasks come first, soonest first; undated ones follow in their own order.
	const later = "/api/tasks?status=later&date=2090-09-06"
	require.Equal(t, []string{"Tomorrow, first", "Tomorrow, second", "Friday", "Sometime, first", "Sometime, second"}, titles(later))

	// Move to Later: off today's list, undated. A Carried task starts fresh there.
	_, err := store.Pool.Exec(ctx, `UPDATE tasks SET defer_count=2,carried_over=true WHERE id=$1`, onToday)
	require.NoError(t, err)
	_, err = store.Pool.Exec(ctx, `INSERT INTO task_carryovers(task_id,first_planned_date) VALUES($1,'2090-09-01')`, onToday)
	require.NoError(t, err)
	moved := httpJSON(t, r, "PATCH", "/api/tasks/"+onToday, map[string]any{"status": "backlog"}, 200)
	require.Equal(t, "backlog", moved["status"])
	require.EqualValues(t, 0, moved["deferCount"])
	require.Empty(t, titles("/api/tasks?date=2090-09-06"))
	require.Contains(t, titles(later), "On today")
	var records int
	require.NoError(t, store.Pool.QueryRow(ctx, `SELECT count(*) FROM task_carryovers WHERE task_id=$1`, onToday).Scan(&records))
	require.Zero(t, records)
	_ = user

	// Move to today: planned for today, below what is already there, and out of Later.
	httpJSON(t, r, "PATCH", "/api/tasks/"+onToday, map[string]any{"status": "planned", "plannedForDate": "2090-09-06"}, 200)
	arrived := httpJSON(t, r, "PATCH", "/api/tasks/"+sometime, map[string]any{"status": "planned", "plannedForDate": "2090-09-06"}, 200)
	require.Equal(t, "2090-09-06", arrived["plannedForDate"])
	require.Equal(t, []string{"On today", "Sometime, first"}, titles("/api/tasks?date=2090-09-06"))
	require.NotContains(t, titles(later), "Sometime, first")

	httpJSON(t, r, "GET", "/api/tasks?status=later", nil, 400)
}
