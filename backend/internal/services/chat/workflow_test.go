package chat

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"strings"
	"sync"
	"testing"

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
func planTask(title string) ProposalTask {
	return ProposalTask{Title: title, Duration: 30, Urgency: "medium", Disposition: "today", Reason: "Fits today's priorities"}
}

func TestParseAgentReply(t *testing.T) {
	current := generated.Task{ID: uuid.New(), Status: generated.TaskStatusPlanned}
	completed := generated.Task{ID: uuid.New(), Status: generated.TaskStatusCompleted, Completed: true}
	inbox := generated.Task{ID: uuid.New(), Status: generated.TaskStatusBacklog}
	category := generated.Category{ID: uuid.New()}
	valid := AgentReply{Message: "Review this plan.", Phase: "proposal", AvailableMinutes: ptr(int32(60)), Tasks: []ProposalTask{planTask("Report"), planTask("Exercise")}}
	valid.Tasks[0].ID = &current.ID
	valid.Tasks[0].CategoryID = &category.ID
	valid.Tasks[1].ID = &inbox.ID
	parse := func(raw string) error {
		_, err := ParseAgentReply(raw, []generated.Task{current, completed}, []generated.Task{inbox}, []generated.Category{category})
		return err
	}
	require.NoError(t, parse(encode(t, valid)))
	cases := map[string]func(*AgentReply){
		"foreign task":            func(r *AgentReply) { r.Tasks[0].ID = ptr(uuid.New()) },
		"completed task":          func(r *AgentReply) { r.Tasks[0].ID = &completed.ID },
		"duplicate task":          func(r *AgentReply) { r.Tasks[1].ID = &current.ID },
		"missing unfinished task": func(r *AgentReply) { r.Tasks = r.Tasks[1:] },
		"foreign category":        func(r *AgentReply) { r.Tasks[0].CategoryID = ptr(uuid.New()) },
		"over capacity":           func(r *AgentReply) { r.AvailableMinutes = ptr(int32(30)) },
		"negative duration":       func(r *AgentReply) { r.Tasks[0].Duration = -1 },
		"unsupported urgency":     func(r *AgentReply) { r.Tasks[0].Urgency = "critical" },
		"unsupported disposition": func(r *AgentReply) { r.Tasks[0].Disposition = "delete" },
		"clarifying with tasks":   func(r *AgentReply) { r.Phase = "clarifying" },
	}
	for name, change := range cases {
		t.Run(name, func(t *testing.T) {
			r := valid
			r.Tasks = append([]ProposalTask{}, valid.Tasks...)
			change(&r)
			require.Error(t, parse(encode(t, r)))
		})
	}
	require.Error(t, parse(encode(t, valid)+" trailing text"))
	require.Error(t, parse(`{"message":"x","phase":"clarifying","availableMinutes":null,"tasks":[],"save":true}`))
	require.Error(t, parse(`{"message":"x","phase":"clarifying","tasks":[]}`))
	require.Error(t, parse("```json\n"+encode(t, valid)+"\n```"))
	_, err := ParseAgentReply(`{"message":"Nothing planned today.","phase":"proposal","availableMinutes":0,"tasks":[]}`, nil, nil, nil)
	require.NoError(t, err)
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

type fakeAgent struct {
	mu        sync.Mutex
	response  string
	calls     int
	last      []mastra.ChatMessage
	lastModel string
}

func (f *fakeAgent) Chat(_ context.Context, m []mastra.ChatMessage, _, _, model string) (*mastra.ChatResponse, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	f.last = m
	f.lastModel = model
	return &mastra.ChatResponse{Message: f.response}, nil
}

// StreamChat delivers the canned reply in small fragments, like a model would.
func (f *fakeAgent) StreamChat(ctx context.Context, m []mastra.ChatMessage, thread, resource, model string, onDelta func(string)) (*mastra.ChatResponse, error) {
	resp, err := f.Chat(ctx, m, thread, resource, model)
	if err != nil {
		return nil, err
	}
	for i := 0; i < len(resp.Message); i += 7 {
		onDelta(resp.Message[i:min(i+7, len(resp.Message))])
	}
	return resp, nil
}

func TestProcessStreamForwardsOnlyTheMessageText(t *testing.T) {
	s, a, user, date := testService(t)
	a.response = `{"message":"Start with the report, then rest.","phase":"clarifying","availableMinutes":null,"tasks":[]}`
	var streamed strings.Builder
	r, err := s.ProcessStream(context.Background(), ProcessRequest{UserID: user, SessionDate: date, Content: "Plan my day", RequestID: uuid.New(), Model: "groq/openai/gpt-oss-20b"}, func(text string) { streamed.WriteString(text) })
	require.NoError(t, err)
	require.Equal(t, "Start with the report, then rest.", streamed.String())
	require.Equal(t, r.Text, streamed.String())
	require.Len(t, r.Workflow.Messages, 2)
	require.Equal(t, 1, a.calls)
	require.Equal(t, "groq/openai/gpt-oss-20b", a.lastModel)
}
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
	return NewService(store, agent), agent, user.ID, date
}
func createTask(t *testing.T, s *Service, user uuid.UUID, date pgtype.Date, title string) generated.Task {
	t.Helper()
	task, err := s.store.Queries.CreateTask(context.Background(), generated.CreateTaskParams{UserID: user, Title: title, Duration: ptr(int32(30)), Urgency: generated.UrgencyLevelMedium, Source: generated.TaskSourceManual, PlannedForDate: date, Status: generated.TaskStatusPlanned})
	require.NoError(t, err)
	return task
}
func propose(t *testing.T, s *Service, a *fakeAgent, user uuid.UUID, date pgtype.Date, tasks ...ProposalTask) *Workflow {
	t.Helper()
	a.response = encode(t, AgentReply{Message: "Review and confirm these tasks.", Phase: "proposal", AvailableMinutes: ptr(int32(300)), Tasks: tasks})
	r, err := s.Process(context.Background(), ProcessRequest{UserID: user, SessionDate: date, Content: "Plan my day", RequestID: uuid.New()})
	require.NoError(t, err)
	return r.Workflow
}

func TestWorkflowConfirmationAndChatRetries(t *testing.T) {
	s, a, user, date := testService(t)
	ctx := context.Background()
	a.response = encode(t, AgentReply{Message: "Review this plan.", Phase: "proposal", AvailableMinutes: ptr(int32(60)), Tasks: []ProposalTask{planTask("Report")}})
	req := ProcessRequest{UserID: user, SessionDate: date, Content: "I need to write the report", RequestID: uuid.New()}
	// Concurrent retries share one committed turn and one model call.
	results := make([]*ProcessResponse, 2)
	errs := make([]error, 2)
	var wg sync.WaitGroup
	for i := range 2 {
		wg.Add(1)
		go func() { defer wg.Done(); results[i], errs[i] = s.Process(ctx, req) }()
	}
	wg.Wait()
	require.NoError(t, errs[0])
	require.NoError(t, errs[1])
	require.Equal(t, 1, a.calls)
	w := results[0].Workflow
	require.Len(t, w.Messages, 2)
	require.Empty(t, w.Tasks)
	require.NotNil(t, w.Proposal)
	require.Equal(t, "user", w.Messages[0].Role)
	require.Equal(t, "assistant", w.Messages[1].Role)
	require.Equal(t, "system", a.last[0].Role)
	require.Contains(t, a.last[0].Content, `"date":"2026-09-06"`)
	require.Equal(t, w.Proposal.ID, results[1].Workflow.Proposal.ID)
	req.Content = "A different request"
	_, err := s.Process(ctx, req)
	require.Error(t, err)
	confirmed, err := s.Confirm(ctx, user, date, w.Proposal.ID, w.Version)
	require.NoError(t, err)
	require.Equal(t, "active", confirmed.State)
	require.Nil(t, confirmed.Proposal)
	require.Len(t, confirmed.Tasks, 1)
	repeated, err := s.Confirm(ctx, user, date, w.Proposal.ID, w.Version)
	require.NoError(t, err)
	require.Len(t, repeated.Tasks, 1)
	require.Equal(t, confirmed.Tasks[0].ID, repeated.Tasks[0].ID)
	restored, err := s.Get(ctx, user, date)
	require.NoError(t, err)
	require.Equal(t, confirmed, restored)
}

func TestWorkflowRejectsStaleAndInvalidProposals(t *testing.T) {
	s, a, user, date := testService(t)
	ctx := context.Background()
	task := createTask(t, s, user, date, "Report")
	p := planTask("Report")
	p.ID = &task.ID
	w := propose(t, s, a, user, date, p)
	_, err := s.store.Pool.Exec(ctx, `UPDATE tasks SET title='Changed independently',updated_at=clock_timestamp() WHERE id=$1`, task.ID)
	require.NoError(t, err)
	_, err = s.Confirm(ctx, user, date, w.Proposal.ID, w.Version)
	require.ErrorIs(t, err, ErrConflict)
	a.response = `{"message":"I saved it!","phase":"proposal","availableMinutes":60,"tasks":[]}`
	_, err = s.Process(ctx, ProcessRequest{UserID: user, SessionDate: date, Content: "Try again", RequestID: uuid.New()})
	require.Error(t, err)
	after, err := s.Get(ctx, user, date)
	require.NoError(t, err)
	require.Len(t, after.Messages, 2)
	require.Equal(t, w.Proposal.ID, after.Proposal.ID)
	require.Equal(t, "Changed independently", after.Tasks[0].Title)
}

func TestClarifyingPreservesProposalAndDiscardPreservesTasks(t *testing.T) {
	s, a, user, date := testService(t)
	ctx := context.Background()
	w := propose(t, s, a, user, date, planTask("Report"))
	a.response = `{"message":"How much time remains?","phase":"clarifying","availableMinutes":null,"tasks":[]}`
	r, err := s.Process(ctx, ProcessRequest{UserID: user, SessionDate: date, Content: "Shorten the plan", RequestID: uuid.New()})
	require.NoError(t, err)
	require.Equal(t, w.Proposal.ID, r.Workflow.Proposal.ID)
	discarded, err := s.Discard(ctx, user, date, r.Workflow.Proposal.ID, r.Workflow.Version)
	require.NoError(t, err)
	require.Nil(t, discarded.Proposal)
	require.Len(t, discarded.Messages, 4)
	require.Empty(t, discarded.Tasks)
	_, err = s.Confirm(ctx, user, date, w.Proposal.ID, w.Version)
	require.ErrorIs(t, err, ErrConflict)
	_, err = s.Discard(ctx, user, date, w.Proposal.ID, w.Version)
	require.ErrorIs(t, err, ErrConflict)
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
	_, err = s.store.Pool.Exec(ctx, `UPDATE tasks SET title='Later edit' WHERE id=$1`, carry.ID)
	require.NoError(t, err)
	past, err := s.Get(ctx, user, date)
	require.NoError(t, err)
	require.Equal(t, result.Workflow.Tasks, past.Tasks)
	sessions, err := s.store.Queries.ListChatSessionsByUser(ctx, user)
	require.NoError(t, err)
	require.Len(t, sessions, 1)
	require.Equal(t, "Daily plan", sessions[0].Title)
	require.Zero(t, sessions[0].MessageCount)
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
