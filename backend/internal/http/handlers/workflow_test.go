package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

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
	workflow := handlers.NewChatHandler(store, chat.NewService(store, nil))
	r.GET("/api/workflow", workflow.GetWorkflow)
	r.POST("/api/day/plan/confirm", workflow.Confirm)
	r.GET("/api/history", workflow.History)
	r.POST("/api/day/rollover", workflow.Rollover)
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

// streamedReply posts a chat message and returns the committed reply: the
// payload of the stream's "done" event.
func streamedReply(t *testing.T, r http.Handler, path string, body any) map[string]any {
	t.Helper()
	data, err := json.Marshal(body)
	require.NoError(t, err)
	req := httptest.NewRequest("POST", path, bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")
	result := httptest.NewRecorder()
	r.ServeHTTP(result, req)
	require.Equal(t, 200, result.Code, result.Body.String())
	_, done, found := strings.Cut(result.Body.String(), "event: done\ndata: ")
	require.True(t, found, result.Body.String())
	done, _, _ = strings.Cut(done, "\n")
	var reply map[string]any
	require.NoError(t, json.Unmarshal([]byte(done), &reply))
	return reply
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
	captured := httpJSON(t, r, "POST", "/api/tasks", map[string]any{"title": "Later task", "status": "backlog", "plannedForDate": "2090-09-06"}, 201)
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
	r, store, _ := setupWorkflowHTTP(t)
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
	friday := add("Friday", map[string]any{"plannedForDate": "2090-09-11"})
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

	// Move to today: planned for today, below what is already there, and out of Later.
	httpJSON(t, r, "PATCH", "/api/tasks/"+onToday, map[string]any{"status": "planned", "plannedForDate": "2090-09-06"}, 200)
	arrived := httpJSON(t, r, "PATCH", "/api/tasks/"+sometime, map[string]any{"status": "planned", "plannedForDate": "2090-09-06"}, 200)
	require.Equal(t, "2090-09-06", arrived["plannedForDate"])
	require.Equal(t, []string{"On today", "Sometime, first"}, titles("/api/tasks?date=2090-09-06"))
	require.NotContains(t, titles(later), "Sometime, first")

	// A task dated for a future day moves to today the same way.
	httpJSON(t, r, "PATCH", "/api/tasks/"+friday, map[string]any{"status": "planned", "plannedForDate": "2090-09-06"}, 200)
	require.Equal(t, []string{"On today", "Sometime, first", "Friday"}, titles("/api/tasks?date=2090-09-06"))
	require.NotContains(t, titles(later), "Friday")

	httpJSON(t, r, "GET", "/api/tasks?status=later", nil, 400)
}

func TestDroppingALaterTaskAndRestoringItKeepsItsPlace(t *testing.T) {
	r, _, _ := setupWorkflowHTTP(t)
	add := func(title string, order int) string {
		return httpJSON(t, r, "POST", "/api/tasks", map[string]any{"title": title, "status": "backlog", "plannedForDate": "2090-09-06", "sortOrder": order}, 201)["id"].(string)
	}
	later := func() []string {
		out := []string{}
		for _, task := range httpJSON(t, r, "GET", "/api/tasks?status=later&date=2090-09-06", nil, 200)["tasks"].([]any) {
			out = append(out, task.(map[string]any)["title"].(string))
		}
		return out
	}
	first := add("First", 0)
	add("Second", 1)
	httpJSON(t, r, "PATCH", "/api/tasks/"+first, map[string]any{"status": "dropped"}, 200)
	require.Equal(t, []string{"Second"}, later())
	httpJSON(t, r, "PATCH", "/api/tasks/"+first, map[string]any{"status": "backlog"}, 200)
	require.Equal(t, []string{"First", "Second"}, later(), "a restored task is back where it was, not re-planned")
}

// Today reads its list over HTTP, so this follows a dated task through the
// same endpoints: in Later the day before, on the list once its Day arrives.
func TestAFutureDatedTaskIsOnItsDaysListAfterRollover(t *testing.T) {
	r, _, _ := setupWorkflowHTTP(t)
	now := time.Now().UTC()
	today, yesterday := now.Format("2006-01-02"), now.AddDate(0, 0, -1).Format("2006-01-02")
	listed := func(path string) []map[string]any {
		out := []map[string]any{}
		for _, task := range httpJSON(t, r, "GET", path, nil, 200)["tasks"].([]any) {
			out = append(out, task.(map[string]any))
		}
		return out
	}
	httpJSON(t, r, "POST", "/api/tasks", map[string]any{"title": "Call the bank", "plannedForDate": today}, 201)
	waiting := listed("/api/tasks?status=later&date=" + yesterday)
	require.Len(t, waiting, 1, "the day before, it waits in Later")

	httpJSON(t, r, "POST", "/api/day/rollover", map[string]any{"timezone": "UTC"}, 200)
	onDay := listed("/api/tasks?date=" + today)
	require.Len(t, onDay, 1)
	require.Equal(t, "Call the bank", onDay[0]["title"])
	require.EqualValues(t, 0, onDay[0]["deferCount"], "it arrives as planned work, not as a Carried task")
	require.Empty(t, listed("/api/tasks?status=later&date="+today))
}

// Wrap up is the close-day endpoint with Keep ("tomorrow") or Drop per
// unchecked task and an optional note. New work afterwards continues the Day.
func TestWrapUpNeedsNoEnergyLevelAndNewWorkContinuesTheDay(t *testing.T) {
	r, _, _ := setupWorkflowHTTP(t)
	today := time.Now().UTC().Format("2006-01-02")
	add := func(title string, fields map[string]any) string {
		body := map[string]any{"title": title, "plannedForDate": today}
		for key, value := range fields {
			body[key] = value
		}
		return httpJSON(t, r, "POST", "/api/tasks", body, 201)["id"].(string)
	}
	state := func() string {
		return httpJSON(t, r, "GET", "/api/workflow?date="+today, nil, 200)["state"].(string)
	}
	titles := func() []string {
		out := []string{}
		for _, task := range httpJSON(t, r, "GET", "/api/tasks?date="+today, nil, 200)["tasks"].([]any) {
			out = append(out, task.(map[string]any)["title"].(string))
		}
		return out
	}
	wrapUp := func(body map[string]any) map[string]any {
		body["date"] = today
		return httpJSON(t, r, "POST", "/api/day/close", body, 200)
	}
	report, reading, errand := add("Report", nil), add("Reading", map[string]any{"sortOrder": 1}), add("Errand", map[string]any{"sortOrder": 2})
	// A list that no longer matches the Day's tasks is refused with its own
	// code, so the sheet can refresh instead of showing a raw error.
	for name, actions := range map[string][]any{
		"a task is missing":       {map[string]any{"taskId": report, "action": "tomorrow"}},
		"a task is not this Day's": {map[string]any{"taskId": uuid.NewString(), "action": "tomorrow"}},
	} {
		refused := httpJSON(t, r, "POST", "/api/day/close", map[string]any{"date": today, "taskActions": actions}, 400)
		require.Equal(t, "list_changed", refused["code"], name)
	}
	require.Equal(t, "validation", httpJSON(t, r, "POST", "/api/day/close", map[string]any{"date": today, "taskActions": []any{map[string]any{"taskId": report, "action": "later"}}}, 400)["code"])
	someday := add("Someday", map[string]any{"status": "backlog"})
	httpJSON(t, r, "PATCH", "/api/tasks/"+report, map[string]any{"completed": true}, 200)

	wrapped := wrapUp(map[string]any{"notes": "Lab ran long.", "taskActions": []any{
		map[string]any{"taskId": report, "action": "done"},
		map[string]any{"taskId": reading, "action": "tomorrow"},
		map[string]any{"taskId": errand, "action": "drop"},
	}})
	require.Equal(t, "Lab ran long.", wrapped["notes"])
	require.Nil(t, wrapped["energyLevel"])
	require.EqualValues(t, 1, wrapped["carriedToTomorrowCount"])
	require.EqualValues(t, 1, wrapped["droppedCount"])
	require.Equal(t, time.Now().UTC().AddDate(0, 0, 1).Format("2006-01-02"), wrapped["carriedToDate"])
	require.Equal(t, "closed", state())
	// This Wrap up's own record lists each task once.
	record := httpJSON(t, r, "GET", "/api/workflow?date="+today, nil, 200)["reviewHistory"].([]any)[0].(map[string]any)
	require.Len(t, record["tasks"], 3)
	require.EqualValues(t, 1, record["review"].(map[string]any)["droppedCount"])

	// Quick add after Wrap up: the task is saved and the Day goes on.
	oneMore := add("One more", map[string]any{"sortOrder": 3})
	require.Equal(t, "active", state())
	require.Equal(t, []string{"Report", "One more"}, titles())

	// The same holds for a task moved onto today from Later.
	wrapUp(map[string]any{"taskActions": []any{
		map[string]any{"taskId": report, "action": "done"},
		map[string]any{"taskId": oneMore, "action": "tomorrow"},
	}})
	require.Equal(t, "closed", state())
	httpJSON(t, r, "PATCH", "/api/tasks/"+someday, map[string]any{"status": "planned", "plannedForDate": today}, 200)
	require.Equal(t, "active", state())
	require.Equal(t, []string{"Report", "Someday"}, titles())

	// Edits to what is already on a wrapped-up Day are still refused.
	wrapUp(map[string]any{"taskActions": []any{
		map[string]any{"taskId": report, "action": "done"},
		map[string]any{"taskId": someday, "action": "drop"},
	}})
	httpJSON(t, r, "PATCH", "/api/tasks/"+report, map[string]any{"completed": false}, 409)
	// Only work still to do continues the Day; a finished record does not.
	httpJSON(t, r, "POST", "/api/tasks", map[string]any{"title": "Already done", "plannedForDate": today, "status": "completed"}, 409)
	require.Equal(t, "closed", state())
}

// The wrapped line reads this count, so it must be what carries now, not
// what an earlier Wrap up of the same Day carried.
func TestWrappingUpAgainCountsOnlyWhatStillCarries(t *testing.T) {
	r, _, _ := setupWorkflowHTTP(t)
	today := time.Now().UTC().Format("2006-01-02")
	wrapUp := func(actions ...any) map[string]any {
		if actions == nil {
			actions = []any{}
		}
		return httpJSON(t, r, "POST", "/api/day/close", map[string]any{"date": today, "taskActions": actions}, 200)
	}
	reading := httpJSON(t, r, "POST", "/api/tasks", map[string]any{"title": "Reading", "plannedForDate": today}, 201)["id"].(string)
	require.EqualValues(t, 1, wrapUp(map[string]any{"taskId": reading, "action": "tomorrow"})["carriedToTomorrowCount"])

	// Brought back to today, then parked in Later: it no longer carries anywhere.
	httpJSON(t, r, "PATCH", "/api/tasks/"+reading, map[string]any{"status": "planned", "plannedForDate": today}, 200)
	httpJSON(t, r, "PATCH", "/api/tasks/"+reading, map[string]any{"status": "backlog"}, 200)
	again := wrapUp()
	require.EqualValues(t, 0, again["carriedToTomorrowCount"])
	require.Nil(t, again["carriedToDate"])
}

// Drop from a row menu is only a status change, so the Day's record has to
// pick the task up for it to stay findable in History.
func TestADirectlyDroppedTaskIsUnderDroppedInHistoryAfterWrapUp(t *testing.T) {
	r, _, _ := setupWorkflowHTTP(t)
	now := time.Now().UTC()
	today, tomorrow := now.Format("2006-01-02"), now.AddDate(0, 0, 1).Format("2006-01-02")
	add := func(title string, fields map[string]any) string {
		body := map[string]any{"title": title, "plannedForDate": today}
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
	errand := add("Errand", nil)
	reading := add("Reading", map[string]any{"sortOrder": 1})
	// A Later task parked long ago: its stored date is not a Day it belongs to.
	someday := add("Someday", map[string]any{"status": "backlog", "plannedForDate": "2020-01-01"})

	httpJSON(t, r, "PATCH", "/api/tasks/"+errand, map[string]any{"status": "dropped"}, 200)
	require.Equal(t, []string{"Reading"}, titles("/api/tasks?date="+today))
	// Undo restores the previous status, and the task is back where it was.
	httpJSON(t, r, "PATCH", "/api/tasks/"+errand, map[string]any{"status": "planned"}, 200)
	require.Equal(t, []string{"Errand", "Reading"}, titles("/api/tasks?date="+today))

	httpJSON(t, r, "PATCH", "/api/tasks/"+errand, map[string]any{"status": "dropped"}, 200)
	httpJSON(t, r, "PATCH", "/api/tasks/"+someday, map[string]any{"status": "dropped"}, 200)
	require.Empty(t, titles("/api/tasks?status=later&date="+today))

	wrapped := httpJSON(t, r, "POST", "/api/day/close", map[string]any{"date": today, "taskActions": []any{map[string]any{"taskId": reading, "action": "tomorrow"}}}, 200)
	require.EqualValues(t, 2, wrapped["droppedCount"])
	days := httpJSON(t, r, "GET", "/api/history?before="+tomorrow, nil, 200)["days"].([]any)
	require.Len(t, days, 1)
	day := days[0].(map[string]any)
	require.Equal(t, today, day["date"])
	require.ElementsMatch(t, []any{"Errand", "Someday"}, day["dropped"])
	require.Equal(t, []any{"Reading"}, day["carried"])
	require.EqualValues(t, 2, day["droppedCount"])

	// The Day's own read-only view lists it too.
	statuses := map[string]string{}
	for _, task := range httpJSON(t, r, "GET", "/api/workflow?date="+today, nil, 200)["tasks"].([]any) {
		statuses[task.(map[string]any)["title"].(string)] = task.(map[string]any)["status"].(string)
	}
	require.Equal(t, map[string]string{"Errand": "dropped", "Someday": "dropped", "Reading": "planned"}, statuses)

	// Once the Day is wrapped up its record is settled, so a Later task can't
	// be dropped onto it and go missing from History.
	parked := add("Parked", map[string]any{"status": "backlog"})
	httpJSON(t, r, "PATCH", "/api/tasks/"+parked, map[string]any{"status": "dropped"}, 409)
	require.Contains(t, titles("/api/tasks?status=later&date="+today), "Parked")
}

func TestALaterTaskDroppedThroughADraftIsUnderDroppedForTheDayItWasDroppedOn(t *testing.T) {
	r, store, user := setupWorkflowHTTP(t)
	now := time.Now().UTC()
	today, tomorrow := now.Format("2006-01-02"), now.AddDate(0, 0, 1).Format("2006-01-02")
	someday := httpJSON(t, r, "POST", "/api/tasks", map[string]any{"title": "Someday", "status": "backlog", "plannedForDate": "2020-01-01"}, 201)["id"].(string)
	draftID := uuid.NewString()
	draft := `{"id":"` + draftID + `","entries":{"` + someday + `":{"ref":"` + someday + `","taskId":"` + someday + `","remove":true,"turns":[]}},"order":["` + someday + `"]}`
	_, err := store.Pool.Exec(context.Background(), `INSERT INTO daily_plans (user_id,plan_date,state,version,draft) VALUES ($1,$2,'planning',1,$3)`, user, today, draft)
	require.NoError(t, err)
	httpJSON(t, r, "POST", "/api/day/plan/confirm", map[string]any{"date": today, "draftId": draftID, "version": 1}, 200)
	httpJSON(t, r, "POST", "/api/day/close", map[string]any{"date": today, "taskActions": []any{}}, 200)
	days := httpJSON(t, r, "GET", "/api/history?before="+tomorrow, nil, 200)["days"].([]any)
	require.Len(t, days, 1, "the drop is on today's record, not on the long-past Day the task was last dated for")
	require.Equal(t, today, days[0].(map[string]any)["date"])
	require.Equal(t, []any{"Someday"}, days[0].(map[string]any)["dropped"])
}

func TestADirectlyDroppedTaskIsUnderDroppedInHistoryAfterRollover(t *testing.T) {
	r, store, user := setupWorkflowHTTP(t)
	ctx := context.Background()
	now := time.Now().UTC()
	day := func(offset int) string { return now.AddDate(0, 0, offset).Format("2006-01-02") }
	// Past Days can't be written through the API, so they are seeded as they
	// would have been left: a task dropped from the list, another never ticked.
	seed := func(title, date string, status generated.TaskStatus) {
		planned, err := chat.ParseDate(date)
		require.NoError(t, err)
		_, err = store.Queries.CreateTask(ctx, generated.CreateTaskParams{UserID: user, Title: title, Urgency: generated.UrgencyLevelMedium, Source: generated.TaskSourceManual, PlannedForDate: planned, Status: status})
		require.NoError(t, err)
	}
	seed("Old errand", day(-1), generated.TaskStatusDropped)
	seed("Old reading", day(-1), generated.TaskStatusPlanned)
	// A Day where the only task was dropped still ends, so the drop is on record.
	seed("Gave up", day(-2), generated.TaskStatusDropped)

	httpJSON(t, r, "POST", "/api/day/rollover", map[string]any{"timezone": "UTC"}, 200)
	days := httpJSON(t, r, "GET", "/api/history?before="+day(0), nil, 200)["days"].([]any)
	require.Len(t, days, 2)
	yesterday, before := days[0].(map[string]any), days[1].(map[string]any)
	require.Equal(t, day(-1), yesterday["date"])
	require.Equal(t, []any{"Old errand"}, yesterday["dropped"])
	require.Equal(t, []any{"Old reading"}, yesterday["carried"])
	require.Equal(t, false, yesterday["wrappedUp"])
	require.Equal(t, day(-2), before["date"])
	require.Equal(t, []any{"Gave up"}, before["dropped"])
	require.EqualValues(t, 1, before["droppedCount"])
}
