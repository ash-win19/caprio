package chat

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ashwinshanmugam/caprio/backend/internal/db"
	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/ashwinshanmugam/caprio/backend/internal/mastra"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func ptr[T any](v T) *T { return &v }
func encode(t *testing.T, v any) string {
	t.Helper()
	b, err := json.Marshal(v)
	require.NoError(t, err)
	return string(b)
}

// toolFunc calls a planner tool the way the Mastra agent does: through
// Service.ApplyTool with the turn's token.
type toolFunc func(name string, input any) *ToolResult

// fakeAgent stands in for the planner. By default it turns ops into tool calls
// (as a model following the prompt would) and replies with response; script
// replaces that for tests that need a specific turn.
type fakeAgent struct {
	mu        sync.Mutex
	s         *Service
	response  string
	ops       []TaskOperation
	script    func(ctx context.Context, call mastra.Call, tool toolFunc) (string, error)
	calls     int
	last      []mastra.ChatMessage
	lastModel string
	lastCall  mastra.Call
	results   []*ToolResult
}

func (f *fakeAgent) Chat(ctx context.Context, call mastra.Call) (*mastra.ChatResponse, error) {
	f.mu.Lock()
	f.calls++
	f.last, f.lastModel, f.lastCall = call.Messages, call.Model, call
	script, ops, response := f.script, f.ops, f.response
	f.mu.Unlock()
	token, _ := call.RequestContext["turnToken"].(string)
	tool := func(name string, input any) *ToolResult {
		raw, _ := json.Marshal(input)
		result, err := f.s.ApplyTool(ctx, token, name, raw)
		if err != nil {
			result = &ToolResult{Error: &ToolError{Code: "rejected", Message: err.Error()}}
		}
		f.mu.Lock()
		f.results = append(f.results, result)
		f.mu.Unlock()
		return result
	}
	if script != nil {
		text, err := script(ctx, call, tool)
		if err != nil {
			return nil, err
		}
		return &mastra.ChatResponse{Message: text}, nil
	}
	for _, op := range ops {
		callOperation(tool, op)
	}
	if response == "" {
		response = "Here is the plan."
	}
	return &mastra.ChatResponse{Message: response}, nil
}

// callOperation expresses a task operation as the tool calls a model makes.
// An "exists" result for a saved task becomes a move, as the prompt directs.
func callOperation(tool toolFunc, op TaskOperation) {
	input := map[string]any{}
	for k, v := range op.Fields {
		input[k] = v
	}
	ref := ""
	if op.TaskID != nil {
		ref = op.TaskID.String()
	}
	switch op.Kind {
	case "create":
		input["date"], input["inbox"], input["newOccurrence"] = op.Date, op.Inbox, op.NewOccurrence
		r := tool("add_task", input)
		if r.OK && r.Status == "exists" && r.Existing.TaskID != nil && !r.Existing.Completed {
			tool("move_task", map[string]any{"ref": r.Existing.Ref, "date": op.Date, "inbox": op.Inbox})
		}
	case "update":
		tool("edit_task", map[string]any{"ref": ref, "fields": op.Fields})
	case "move":
		tool("move_task", map[string]any{"ref": ref, "date": op.Date, "inbox": op.Inbox})
		if len(op.Fields) > 0 {
			tool("edit_task", map[string]any{"ref": ref, "fields": op.Fields})
		}
	case "complete":
		tool("set_completed", map[string]any{"ref": ref, "completed": *op.Completed})
	case "remove":
		tool("remove_task", map[string]any{"ref": ref})
	}
}

// testService runs on a fixed clock: 2026-09-06 is today, so it is writable.
func testService(t *testing.T) (*Service, *fakeAgent, uuid.UUID, pgtype.Date) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to an isolated migrated PostgreSQL database")
	}
	pool, err := pgxpool.New(context.Background(), url)
	require.NoError(t, err)
	require.NoError(t, pool.Ping(context.Background()))
	store := db.NewStore(pool)
	user, err := store.Queries.CreateUser(context.Background(), generated.CreateUserParams{Email: uuid.NewString() + "@workflow.test", Name: "Workflow Test", PasswordHash: "unused"})
	require.NoError(t, err)
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, user.ID); pool.Close() })
	agent := &fakeAgent{}
	date, err := ParseDate("2026-09-06")
	require.NoError(t, err)
	s := NewService(store, agent)
	s.now = func() time.Time { return time.Date(2026, 9, 6, 12, 0, 0, 0, time.UTC) }
	agent.s = s
	return s, agent, user.ID, date
}
func createTask(t *testing.T, s *Service, user uuid.UUID, date pgtype.Date, title string) generated.Task {
	t.Helper()
	task, err := s.store.Queries.CreateTask(context.Background(), generated.CreateTaskParams{UserID: user, Title: title, Duration: ptr(int32(30)), Urgency: generated.UrgencyLevelMedium, Source: generated.TaskSourceManual, PlannedForDate: date, Status: generated.TaskStatusPlanned})
	require.NoError(t, err)
	return task
}

// propose runs one turn that adds each title to the draft.
func propose(t *testing.T, s *Service, a *fakeAgent, user uuid.UUID, date pgtype.Date, titles ...string) *Workflow {
	t.Helper()
	a.ops = nil
	for _, title := range titles {
		a.ops = append(a.ops, add(title))
	}
	r, err := s.Process(context.Background(), ProcessRequest{UserID: user, SessionDate: date, Content: "Plan my day", RequestID: uuid.New()})
	require.NoError(t, err)
	return r.Workflow
}

func planTitles(w *Workflow) []string {
	out := []string{}
	if w.Plan == nil {
		return out
	}
	for _, group := range [][]PlanItem{w.Plan.Today, w.Plan.Carried, w.Plan.OtherDays} {
		for _, i := range group {
			out = append(out, i.Title+"|"+i.Badge)
		}
	}
	return out
}

func events(w *Workflow, kind string) []generated.ChatMessage {
	out := []generated.ChatMessage{}
	for _, m := range w.Messages {
		if m.EventType != nil && *m.EventType == kind {
			out = append(out, m)
		}
	}
	return out
}

func TestTurnsBuildOneDraftForTheDayUntilConfirm(t *testing.T) {
	s, a, user, date := testService(t)
	ctx := context.Background()
	phenyx := createTask(t, s, user, date, "Ship Phenyx")
	send := func(content string) *ProcessResponse {
		t.Helper()
		r, err := s.Process(ctx, ProcessRequest{UserID: user, SessionDate: date, Content: content, RequestID: uuid.New()})
		require.NoError(t, err)
		return r
	}
	a.ops = []TaskOperation{add("Ship slides and prepare for demo"), add("ship phenyx")}
	first := send("my tasks are: ship slides and prepare for demo, ship phenyx")
	require.Equal(t, []string{"Ship Phenyx|", "Ship slides and prepare for demo|new"}, planTitles(first.Workflow))
	require.Empty(t, first.Workflow.Tasks[1:], "chat never saves tasks")

	a.ops = []TaskOperation{add("Sleep early")}
	second := send("add one task for sleep early")
	require.Equal(t, []string{"Ship Phenyx|", "Ship slides and prepare for demo|new", "Sleep early|new"}, planTitles(second.Workflow))
	require.Equal(t, first.Workflow.Plan.DraftID, second.Workflow.Plan.DraftID, "one draft for the day")
	updates := events(second.Workflow, "plan_update")
	require.Len(t, updates, 2)
	require.Equal(t, "Plan updated · Added Ship slides and prepare for demo", updates[0].Content)
	require.Equal(t, "Plan updated · Added Sleep early", updates[1].Content)
	var meta struct{ Changes []TurnChange }
	require.NoError(t, json.Unmarshal(updates[1].Metadata, &meta))
	require.Equal(t, "Added", meta.Changes[0].Action)

	sleepRef := second.Workflow.Plan.Today[2].Ref
	require.Equal(t, "Sleep early", second.Workflow.Plan.Today[2].Title)
	a.ops, a.script = nil, func(_ context.Context, _ mastra.Call, tool toolFunc) (string, error) {
		tool("edit_task", map[string]any{"ref": sleepRef, "fields": map[string]any{"description": "Lights out by 10pm"}})
		return "Sleep early now says lights out by 10pm.", nil
	}
	third := send("make sleep early 10pm")
	require.Equal(t, "Plan updated · Edited Sleep early", events(third.Workflow, "plan_update")[2].Content)
	a.script = nil
	fourth := send("thanks, that's all")
	require.Len(t, events(fourth.Workflow, "plan_update"), 3, "a turn that changes nothing adds no update line")
	require.Equal(t, third.Workflow.Plan, fourth.Workflow.Plan)

	w := fourth.Workflow
	confirmed, err := s.Confirm(ctx, user, date, w.Plan.DraftID, w.Version)
	require.NoError(t, err)
	require.Nil(t, confirmed.Plan)
	require.Equal(t, "active", confirmed.State)
	titles := []string{}
	for _, task := range confirmed.Tasks {
		titles = append(titles, task.Title)
	}
	require.ElementsMatch(t, []string{"Ship Phenyx", "Ship slides and prepare for demo", "Sleep early"}, titles)
	for _, task := range confirmed.Tasks {
		if task.Title == "Sleep early" {
			require.Equal(t, "Lights out by 10pm", *task.Description)
		}
		if task.Title == "Ship Phenyx" {
			require.Equal(t, phenyx.ID, task.ID)
		}
	}
	repeated, err := s.Confirm(ctx, user, date, w.Plan.DraftID, w.Version)
	require.NoError(t, err)
	require.Equal(t, confirmed.Tasks, repeated.Tasks)
	restored, err := s.Get(ctx, user, date)
	require.NoError(t, err)
	require.Equal(t, confirmed, restored)
}

func TestTheAgentSeesTheDraftAndReceivesATurnToken(t *testing.T) {
	s, a, user, date := testService(t)
	w := propose(t, s, a, user, date, "Report")
	require.Equal(t, "system", a.last[0].Role)
	require.Contains(t, a.last[0].Content, `"date":"2026-09-06"`)
	require.Contains(t, a.last[0].Content, "planner tools")
	require.Equal(t, maxAgentSteps, a.lastCall.MaxSteps)
	require.NotEmpty(t, a.lastCall.RequestContext["turnToken"])
	propose(t, s, a, user, date)
	require.Contains(t, a.last[0].Content, w.Plan.Today[0].Ref, "the next turn sees the draft's refs")
}

func TestConcurrentRetriesOfOneMessageShareOneTurn(t *testing.T) {
	s, a, user, date := testService(t)
	ctx := context.Background()
	release := make(chan struct{})
	a.script = func(_ context.Context, _ mastra.Call, tool toolFunc) (string, error) {
		tool("add_task", map[string]any{"title": "Report"})
		<-release
		return "The report is on for today.", nil
	}
	req := ProcessRequest{UserID: user, SessionDate: date, Content: "I need to write the report", RequestID: uuid.New()}
	results := make([]*ProcessResponse, 2)
	errs := make([]error, 2)
	var wg sync.WaitGroup
	for i := range 2 {
		wg.Add(1)
		go func() { defer wg.Done(); results[i], errs[i] = s.Process(ctx, req) }()
	}
	time.Sleep(300 * time.Millisecond)
	close(release)
	wg.Wait()
	require.NoError(t, errs[0])
	require.NoError(t, errs[1])
	require.Equal(t, 1, a.calls)
	require.Equal(t, results[0].Text, results[1].Text)
	require.Equal(t, results[0].Workflow.Plan.DraftID, results[1].Workflow.Plan.DraftID)
	req.Content = "A different request"
	_, err := s.Process(ctx, req)
	require.Error(t, err)
}

func TestOnlyOneTurnRunsPerDay(t *testing.T) {
	s, a, user, date := testService(t)
	ctx := context.Background()
	started, release := make(chan struct{}), make(chan struct{})
	a.script = func(context.Context, mastra.Call, toolFunc) (string, error) {
		close(started)
		<-release
		return "Done.", nil
	}
	done := make(chan error)
	go func() {
		_, err := s.Process(ctx, ProcessRequest{UserID: user, SessionDate: date, Content: "First", RequestID: uuid.New()})
		done <- err
	}()
	<-started
	_, err := s.Process(ctx, ProcessRequest{UserID: user, SessionDate: date, Content: "Second", RequestID: uuid.New()})
	require.ErrorIs(t, err, ErrTurnInProgress)
	close(release)
	require.NoError(t, <-done)
	a.script = nil
	_, err = s.Process(ctx, ProcessRequest{UserID: user, SessionDate: date, Content: "Third", RequestID: uuid.New()})
	require.NoError(t, err)
}

func TestAFailedOrStoppedTurnKeepsNoDraftChanges(t *testing.T) {
	s, a, user, date := testService(t)
	ctx := context.Background()
	w := propose(t, s, a, user, date, "Keep me")
	before := planTitles(w)
	send := func(ctx context.Context) error {
		_, err := s.Process(ctx, ProcessRequest{UserID: user, SessionDate: date, Content: "Add more", RequestID: uuid.New()})
		return err
	}
	a.script = func(context.Context, mastra.Call, toolFunc) (string, error) {
		return "", errors.New("mastra returned status 500: boom")
	}
	a.ops = []TaskOperation{add("Half done")}
	a.script = func(ctx context.Context, call mastra.Call, tool toolFunc) (string, error) {
		tool("add_task", map[string]any{"title": "Half done"})
		return "", errors.New("mastra returned status 500: boom")
	}
	require.Error(t, send(ctx))
	cancelled, cancel := context.WithCancel(ctx)
	a.script = func(context.Context, mastra.Call, toolFunc) (string, error) {
		cancel()
		return "", context.Canceled
	}
	require.Error(t, send(cancelled))
	after, err := s.Get(ctx, user, date)
	require.NoError(t, err)
	require.Equal(t, before, planTitles(after))
	require.Len(t, after.Messages, len(w.Messages), "no messages from failed turns")

	// A rejected tool call is retried once from the pre-turn draft.
	attempts := 0
	a.script = func(_ context.Context, _ mastra.Call, tool toolFunc) (string, error) {
		attempts++
		tool("add_task", map[string]any{"title": "Attempt " + string(rune('0'+attempts))})
		if attempts == 1 {
			return "", errors.New(`mastra returned status 400: {"error":{"code":"tool_use_failed"}}`)
		}
		return "Added it.", nil
	}
	r, err := s.Process(ctx, ProcessRequest{UserID: user, SessionDate: date, Content: "Add one", RequestID: uuid.New()})
	require.NoError(t, err)
	require.Equal(t, append(append([]string{}, before...), "Attempt 2|new"), planTitles(r.Workflow))
	a.script = func(_ context.Context, _ mastra.Call, tool toolFunc) (string, error) {
		tool("add_task", map[string]any{"title": "Never saved"})
		return "", errors.New("tool_use_failed")
	}
	_, err = s.Process(ctx, ProcessRequest{UserID: user, SessionDate: date, Content: "Add again", RequestID: uuid.New()})
	var validation *ValidationError
	require.ErrorAs(t, err, &validation)
	require.Equal(t, "plan_update_failed", validation.Code)
	final, err := s.Get(ctx, user, date)
	require.NoError(t, err)
	require.Equal(t, planTitles(r.Workflow), planTitles(final))
}

func TestToolCallsOnlyWorkDuringTheirTurn(t *testing.T) {
	s, a, user, date := testService(t)
	ctx := context.Background()
	var token string
	a.script = func(_ context.Context, call mastra.Call, tool toolFunc) (string, error) {
		token = call.RequestContext["turnToken"].(string)
		bad := tool("edit_task", map[string]any{"ref": uuid.NewString(), "fields": map[string]any{"title": "x"}})
		require.False(t, bad.OK)
		require.Equal(t, "unknown_task", bad.Error.Code)
		return "Which task?", nil
	}
	w := propose(t, s, a, user, date)
	require.Nil(t, w.Plan)
	_, err := s.ApplyTool(ctx, token, "add_task", json.RawMessage(`{"title":"Late"}`))
	require.ErrorIs(t, err, ErrToolAuth, "the turn has ended")
	_, err = s.ApplyTool(ctx, "forged.token", "add_task", json.RawMessage(`{"title":"Forged"}`))
	require.ErrorIs(t, err, ErrToolAuth)
	other := NewService(s.store, a)
	_, err = other.ApplyTool(ctx, token, "add_task", json.RawMessage(`{"title":"Other key"}`))
	require.ErrorIs(t, err, ErrToolAuth)
}

func TestStaleConfirmAndDiscardAreRejected(t *testing.T) {
	s, a, user, date := testService(t)
	ctx := context.Background()
	task := createTask(t, s, user, date, "Report")
	w := propose(t, s, a, user, date, "Slides")
	_, err := s.store.Pool.Exec(ctx, `UPDATE tasks SET title='Changed independently',updated_at=clock_timestamp() WHERE id=$1`, task.ID)
	require.NoError(t, err)
	_, err = s.Confirm(ctx, user, date, w.Plan.DraftID, w.Version)
	require.ErrorIs(t, err, ErrConflict)
	_, err = s.Confirm(ctx, user, date, uuid.New(), w.Version)
	require.ErrorIs(t, err, ErrConflict)
	_, err = s.Discard(ctx, user, date, w.Plan.DraftID, w.Version-1)
	require.ErrorIs(t, err, ErrConflict)
}

func TestClarifyingTurnKeepsTheDraftAndDiscardKeepsTheThread(t *testing.T) {
	s, a, user, date := testService(t)
	ctx := context.Background()
	w := propose(t, s, a, user, date, "Report")
	a.ops, a.response = nil, "How much time remains?"
	r, err := s.Process(ctx, ProcessRequest{UserID: user, SessionDate: date, Content: "Shorten the plan", RequestID: uuid.New()})
	require.NoError(t, err)
	require.Equal(t, w.Plan.DraftID, r.Workflow.Plan.DraftID)
	discarded, err := s.Discard(ctx, user, date, r.Workflow.Plan.DraftID, r.Workflow.Version)
	require.NoError(t, err)
	require.Nil(t, discarded.Plan)
	require.Empty(t, discarded.Tasks)
	last := discarded.Messages[len(discarded.Messages)-1]
	require.Equal(t, ptr("discarded"), last.EventType)
	require.Len(t, discarded.Messages, len(r.Workflow.Messages)+1)
	encoded, err := json.Marshal(discarded)
	require.NoError(t, err)
	require.Contains(t, string(encoded), `"metadata":null`)
	_, err = s.Confirm(ctx, user, date, w.Plan.DraftID, w.Version)
	require.ErrorIs(t, err, ErrConflict)
	_, err = s.Discard(ctx, user, date, w.Plan.DraftID, w.Version)
	require.ErrorIs(t, err, ErrConflict)
}

func TestConfirmKeepsAllRequestedTasksWhenEstimatesExceedAvailableTime(t *testing.T) {
	s, a, user, date := testService(t)
	ctx := context.Background()
	done := createTask(t, s, user, date, "Earlier work")
	_, err := s.store.Pool.Exec(ctx, `UPDATE tasks SET completed=true,status='completed',completed_at=clock_timestamp() WHERE id=$1`, done.ID)
	require.NoError(t, err)
	_, err = s.store.Pool.Exec(ctx, `INSERT INTO daily_plans(user_id,plan_date,state,available_minutes) VALUES ($1,$2,'active',120)`, user, date)
	require.NoError(t, err)
	w := propose(t, s, a, user, date, "Ship workflow", "Fix publishing", "Restore brand", "Research decks", "Prepare demo")
	require.Len(t, w.Tasks, 1, "chat must wait for confirmation before adding tasks")
	confirmed, err := s.Confirm(ctx, user, date, w.Plan.DraftID, w.Version)
	require.NoError(t, err)
	require.Len(t, confirmed.Tasks, 6)
	require.Equal(t, ptr(int32(120)), confirmed.AvailableMinutes)
	for _, task := range confirmed.Tasks {
		if task.ID != done.ID {
			require.Equal(t, generated.TaskStatusPlanned, task.Status)
			require.Equal(t, ptr(int32(120)), task.Duration)
		}
	}
}

func TestConversationEventsFrameTheDaysThread(t *testing.T) {
	s, a, user, date := testService(t)
	ctx := context.Background()
	opened, err := s.Get(ctx, user, date)
	require.NoError(t, err)
	require.NotNil(t, opened.Opener)
	require.Contains(t, *opened.Opener, "What's on today?")

	w := propose(t, s, a, user, date, "Report")
	require.Nil(t, w.Opener)
	require.Equal(t, "event", w.Messages[0].Role)
	require.Equal(t, ptr("opener"), w.Messages[0].EventType)
	require.Equal(t, *opened.Opener, w.Messages[0].Content)
	require.Equal(t, "user", w.Messages[1].Role)
	require.Equal(t, "assistant", a.last[1].Role, "the opener reaches the model as Caprio's own first line")
	require.Equal(t, *opened.Opener, a.last[1].Content)

	discarded, err := s.Discard(ctx, user, date, w.Plan.DraftID, w.Version)
	require.NoError(t, err)
	last := discarded.Messages[len(discarded.Messages)-1]
	require.Equal(t, "Proposal discarded", last.Content)

	w = propose(t, s, a, user, date, "Report")
	notes := []string{}
	for _, m := range a.last {
		if m.Role == "system" && strings.HasPrefix(m.Content, "[Caprio]") {
			notes = append(notes, m.Content)
		}
	}
	require.Equal(t, []string{"[Caprio] Plan updated · Added Report", "[Caprio] The user discarded the draft plan. Nothing from it was saved."}, notes)
	require.Len(t, events(w, "opener"), 1, "the opener is written once per day")

	confirmed, err := s.Confirm(ctx, user, date, w.Plan.DraftID, w.Version)
	require.NoError(t, err)
	last = confirmed.Messages[len(confirmed.Messages)-1]
	require.Equal(t, ptr("plan_saved"), last.EventType)
	require.Equal(t, "Plan saved · 1 task", last.Content)
	after, err := s.Get(ctx, user, date)
	require.NoError(t, err)
	require.Nil(t, after.Opener, "an active day opens on the adjust prompt, not an opener")

	sessions, err := s.store.Queries.ListChatSessionsByUser(ctx, user)
	require.NoError(t, err)
	require.EqualValues(t, 4, sessions[0].MessageCount, "events are not counted as messages")
}

func TestCloseRequiresEveryOutcomeOnce(t *testing.T) {
	one := generated.Task{ID: uuid.New(), Status: generated.TaskStatusPlanned}
	two := generated.Task{ID: uuid.New(), Status: generated.TaskStatusCompleted, Completed: true}
	req := CloseRequest{TaskActions: []TaskAction{{TaskID: one.ID, Action: "tomorrow"}, {TaskID: two.ID, Action: "done"}}}
	require.NoError(t, validateClose(req, []generated.Task{one, two}))
	req.TaskActions = req.TaskActions[:1]
	require.Error(t, validateClose(req, []generated.Task{one, two}))
	req.TaskActions = append(req.TaskActions, req.TaskActions[0])
	require.Error(t, validateClose(req, []generated.Task{one, two}))
	req.TaskActions = []TaskAction{{TaskID: one.ID, Action: "done"}, {TaskID: two.ID, Action: "tomorrow"}}
	require.Error(t, validateClose(req, []generated.Task{one, two}))
}

func TestClosePersistsOutcomesAndCarriesExactlyOnce(t *testing.T) {
	s, _, user, date := testService(t)
	ctx := context.Background()
	done := createTask(t, s, user, date, "Done")
	carry := createTask(t, s, user, date, "Tomorrow")
	drop := createTask(t, s, user, date, "Drop")
	req := CloseRequest{Date: "2026-09-06", Notes: ptr("An interrupted day"), EnergyLevel: ptr(int32(3)), TaskActions: []TaskAction{{done.ID, "done"}, {carry.ID, "tomorrow"}, {drop.ID, "drop"}}}
	result, err := s.Close(ctx, user, req)
	require.NoError(t, err)
	require.Equal(t, int32(1), result.CompletedCount)
	require.Equal(t, int32(1), result.CarriedToTomorrowCount)
	require.Equal(t, int32(1), result.DroppedCount)
	repeated, err := s.Close(ctx, user, req)
	require.NoError(t, err)
	require.Equal(t, result.Review, repeated.Review)
	require.Equal(t, result.Session.ID, repeated.Session.ID)
	require.Equal(t, "closed", result.Workflow.State)
	require.Equal(t, "2026-09-07", result.NextDate)
	nextDate, _ := ParseDate(result.NextDate)
	next, err := s.Get(ctx, user, nextDate)
	require.NoError(t, err)
	require.Len(t, next.Tasks, 1)
	require.Equal(t, int32(1), next.Tasks[0].DeferCount)
	for _, task := range result.Workflow.Tasks {
		if task.ID == carry.ID {
			require.Equal(t, nextDate, task.PlannedForDate)
			require.Equal(t, generated.TaskSourceCarried, task.Source)
			require.Equal(t, int32(1), task.DeferCount)
		}
	}
	_, err = s.store.Pool.Exec(ctx, `UPDATE tasks SET title='Later edit',completed=true,status='completed' WHERE id=$1`, carry.ID)
	require.NoError(t, err)
	past, err := s.Get(ctx, user, date)
	require.NoError(t, err)
	require.Equal(t, result.Workflow.Tasks, past.Tasks)
	sessions, err := s.store.Queries.ListChatSessionsByUser(ctx, user)
	require.NoError(t, err)
	require.Len(t, sessions, 1)
	require.Equal(t, "Daily plan", sessions[0].Title)
	require.Zero(t, sessions[0].MessageCount)
	require.Equal(t, "closed", sessions[0].State)
	require.Equal(t, int32(1), sessions[0].CompletedCount)
	require.Equal(t, int32(1), sessions[0].CarriedCount)
	require.Equal(t, int32(1), sessions[0].DroppedCount)
	require.Equal(t, int32(3), sessions[0].PlannedCount)
	// A closed day remains immutable through the planner.
	_, err = s.Confirm(ctx, user, date, uuid.New(), 0)
	require.ErrorIs(t, err, ErrClosed)
}

func TestMigrationPreservesExistingOnboardingAndDefaultsNewUsers(t *testing.T) {
	s, _, _, _ := testService(t)
	ctx := context.Background()
	tx, err := s.store.Pool.Begin(ctx)
	require.NoError(t, err)
	defer tx.Rollback(ctx)
	schema := "migration_" + uuid.New().String()[:8]
	_, err = tx.Exec(ctx, `CREATE SCHEMA `+schema)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `SET LOCAL search_path TO `+schema+`, public`)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `CREATE TABLE users (id UUID PRIMARY KEY);
        CREATE TABLE standup_sessions (user_id UUID, session_date DATE, tasks_completed INTEGER, notes TEXT, energy_level INTEGER);
        INSERT INTO users (id) VALUES ('10000000-0000-0000-0000-000000000001')`)
	require.NoError(t, err)
	migration, err := os.ReadFile("../../db/migrations/00008_daily_workflow.sql")
	require.NoError(t, err)
	up := bytes.Split(migration, []byte("-- +goose Down"))[0]
	_, err = tx.Exec(ctx, string(up))
	require.NoError(t, err)
	var existing bool
	err = tx.QueryRow(ctx, `SELECT onboarding_complete FROM users WHERE id='10000000-0000-0000-0000-000000000001'`).Scan(&existing)
	require.NoError(t, err)
	require.True(t, existing)
	var fresh bool
	err = tx.QueryRow(ctx, `INSERT INTO users (id) VALUES ('10000000-0000-0000-0000-000000000002') RETURNING onboarding_complete`).Scan(&fresh)
	require.NoError(t, err)
	require.False(t, fresh)
}
