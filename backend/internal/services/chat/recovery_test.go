package chat

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/ashwinshanmugam/caprio/backend/internal/mastra"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func workflowField(t *testing.T, w *Workflow, name string) any {
	t.Helper()
	var fields map[string]any
	require.NoError(t, json.Unmarshal([]byte(encode(t, w)), &fields))
	return fields[name]
}

func TestCarryRequiresNextDayConfirmation(t *testing.T) {
	s, a, user, date := testService(t)
	ctx := context.Background()
	task := createTask(t, s, user, date, "Report")
	closed, err := s.Close(ctx, user, CloseRequest{Date: "2026-09-06", TaskActions: []TaskAction{{task.ID, "tomorrow"}}})
	require.NoError(t, err)
	nextDate, err := ParseDate(closed.NextDate)
	require.NoError(t, err)
	next, err := s.Get(ctx, user, nextDate)
	require.NoError(t, err)
	require.Equal(t, "planning", next.State, "carried tasks are saved, but the next day's plan is not confirmed")
	require.Len(t, next.Tasks, 1)
	require.Equal(t, task.ID, next.Tasks[0].ID)
	draft := propose(t, s, a, user, nextDate, "Write the summary")
	confirmed, err := s.Confirm(ctx, user, nextDate, draft.Plan.DraftID, draft.Version)
	require.NoError(t, err)
	require.Equal(t, "active", confirmed.State)
}

func TestWorkflowFindsTaskOnlyMissedDays(t *testing.T) {
	s, _, user, date := testService(t)
	ctx := context.Background()
	task := createTask(t, s, user, date, "Friday's task")
	monday, _ := ParseDate("2026-09-09")
	w, err := s.Get(ctx, user, monday)
	require.NoError(t, err)
	require.Equal(t, "2026-09-06", workflowField(t, w, "oldestUnclosedDate"))
	for _, selected := range []string{"2026-09-06", "2026-09-07", "2026-09-08"} {
		closed, err := s.Close(ctx, user, CloseRequest{Date: selected, TaskActions: []TaskAction{{task.ID, "tomorrow"}}})
		require.NoError(t, err)
		w, err = s.Get(ctx, user, monday)
		require.NoError(t, err)
		if closed.NextDate < "2026-09-09" {
			require.Equal(t, closed.NextDate, workflowField(t, w, "oldestUnclosedDate"))
		} else {
			require.Nil(t, workflowField(t, w, "oldestUnclosedDate"))
			require.Equal(t, "planning", w.State)
			require.Len(t, w.Tasks, 1)
			require.EqualValues(t, 3, w.Tasks[0].DeferCount)
		}
	}
}

func TestEmptyModelReplyIsNotSaved(t *testing.T) {
	s, a, user, date := testService(t)
	createTask(t, s, user, date, "Must be accounted for")
	a.response = "   "
	a.script = func(context.Context, mastra.Call, toolFunc) (string, error) { return "  ", nil }
	_, err := s.Process(context.Background(), ProcessRequest{UserID: user, SessionDate: date, Content: "Plan my work", RequestID: uuid.New()})
	require.Error(t, err)
	w, err := s.Get(context.Background(), user, date)
	require.NoError(t, err)
	require.Empty(t, w.Messages)
	require.Nil(t, w.Plan)
	require.Len(t, w.Tasks, 1)
}

func TestLegacyClosedDayDoesNotUseLiveTaskDetails(t *testing.T) {
	s, _, user, date := testService(t)
	createTask(t, s, user, date, "A later live title")
	_, err := s.store.Pool.Exec(context.Background(), `INSERT INTO daily_plans(user_id,plan_date,state,review) VALUES($1,$2,'closed','{"completedCount":1}')`, user, date)
	require.NoError(t, err)
	w, err := s.Get(context.Background(), user, date)
	require.NoError(t, err)
	require.Empty(t, w.Tasks, "live tasks must not be presented as archived outcomes")
	require.Equal(t, false, workflowField(t, w, "taskDetailsAvailable"))
	require.EqualValues(t, 1, w.Review.CompletedCount)
}

func TestRecoveryDiscoveryFiltersDatesStatesAndAccounts(t *testing.T) {
	s, _, user, today := testService(t)
	_, _, other, _ := testService(t)
	ctx := context.Background()
	oldest, _ := ParseDate("2026-09-01")
	createTask(t, s, other, oldest, "Other account")
	dropped := createTask(t, s, user, oldest, "Dropped")
	inbox := createTask(t, s, user, oldest, "Inbox")
	_, err := s.store.Pool.Exec(ctx, `UPDATE tasks SET status=CASE WHEN id=$1 THEN 'dropped'::task_status ELSE 'backlog'::task_status END WHERE id IN ($1,$2)`, dropped.ID, inbox.ID)
	require.NoError(t, err)
	closedDate, _ := ParseDate("2026-09-03")
	createTask(t, s, user, closedDate, "Closed history")
	_, err = s.store.Pool.Exec(ctx, `INSERT INTO daily_plans(user_id,plan_date,state) VALUES
		($1,'2026-09-01','planning'),($1,'2026-09-03','closed'),($1,'2026-09-04','active'),($1,'2026-09-07','active')`, user)
	require.NoError(t, err)
	manualDate, _ := ParseDate("2026-09-05")
	manual := createTask(t, s, user, manualDate, "Manual task")
	_, err = s.store.Pool.Exec(ctx, `UPDATE tasks SET completed=true,status='completed' WHERE id=$1`, manual.ID)
	require.NoError(t, err)
	w, err := s.Get(ctx, user, today)
	require.NoError(t, err)
	require.Equal(t, "2026-09-04", *w.OldestUnclosedDate)
	_, err = s.Close(ctx, user, CloseRequest{Date: "2026-09-04", TaskActions: []TaskAction{}})
	require.NoError(t, err)
	w, err = s.Get(ctx, user, today)
	require.NoError(t, err)
	require.Equal(t, "2026-09-05", *w.OldestUnclosedDate)
	_, err = s.Close(ctx, user, CloseRequest{Date: "2026-09-05", TaskActions: []TaskAction{{manual.ID, "done"}}})
	require.NoError(t, err)
	w, err = s.Get(ctx, user, today)
	require.NoError(t, err)
	require.Nil(t, w.OldestUnclosedDate)
}

func TestCarryInvalidatesDestinationDraftWithoutConfirmingIt(t *testing.T) {
	s, a, user, date := testService(t)
	ctx := context.Background()
	task := createTask(t, s, user, date, "Carried report")
	next, _ := ParseDate("2026-09-07")
	draft := propose(t, s, a, user, next, "Next day work")
	req := CloseRequest{Date: "2026-09-06", TaskActions: []TaskAction{{task.ID, "tomorrow"}}}
	_, err := s.Close(ctx, user, req)
	require.NoError(t, err)
	w, err := s.Get(ctx, user, next)
	require.NoError(t, err)
	require.Equal(t, "planning", w.State)
	require.Nil(t, w.Plan)
	require.Equal(t, draft.Version+1, w.Version)
	_, err = s.Confirm(ctx, user, next, draft.Plan.DraftID, draft.Version)
	require.ErrorIs(t, err, ErrConflict)
	_, err = s.Close(ctx, user, req)
	require.NoError(t, err)
	replayed, err := s.Get(ctx, user, next)
	require.NoError(t, err)
	require.Equal(t, w.Version, replayed.Version)
	require.Len(t, replayed.Tasks, 1)
}

func TestEmptyConfirmedDayRemainsActive(t *testing.T) {
	s, a, user, date := testService(t)
	task := createTask(t, s, user, date, "Only task")
	a.ops = []TaskOperation{{Kind: "remove", TaskID: &task.ID}}
	r, err := s.Process(context.Background(), ProcessRequest{UserID: user, SessionDate: date, Content: "Clear my day", RequestID: uuid.New()})
	require.NoError(t, err)
	draft := r.Workflow
	w, err := s.Confirm(context.Background(), user, date, draft.Plan.DraftID, draft.Version)
	require.NoError(t, err)
	require.Equal(t, "active", w.State)
	require.Empty(t, w.Tasks)
	closed, err := s.Close(context.Background(), user, CloseRequest{Date: w.Date, TaskActions: []TaskAction{}})
	require.NoError(t, err)
	require.True(t, closed.Workflow.TaskDetailsAvailable)
	require.Empty(t, closed.Workflow.Tasks)
}

func TestCarryPreservesActiveDestination(t *testing.T) {
	s, a, user, date := testService(t)
	ctx := context.Background()
	task := createTask(t, s, user, date, "Carry")
	next, _ := ParseDate("2026-09-07")
	draft := propose(t, s, a, user, next, "Already confirmed")
	confirmed, err := s.Confirm(ctx, user, next, draft.Plan.DraftID, draft.Version)
	require.NoError(t, err)
	a.ops = []TaskOperation{{Kind: "update", TaskID: &confirmed.Tasks[0].ID, Fields: fields(map[string]any{"duration": 45})}}
	_, err = s.Process(ctx, ProcessRequest{UserID: user, SessionDate: next, Content: "Make it 45 minutes", RequestID: uuid.New()})
	require.NoError(t, err)
	_, err = s.Close(ctx, user, CloseRequest{Date: "2026-09-06", TaskActions: []TaskAction{{task.ID, "tomorrow"}}})
	require.NoError(t, err)
	w, err := s.Get(ctx, user, next)
	require.NoError(t, err)
	require.Equal(t, "active", w.State)
	require.Nil(t, w.Plan)
	require.Len(t, w.Tasks, 2)
}

func TestCarryUsesNextCalendarDateAcrossBoundaries(t *testing.T) {
	for _, pair := range [][2]string{{"2026-12-31", "2027-01-01"}, {"2026-10-31", "2026-11-01"}, {"2026-11-01", "2026-11-02"}} {
		t.Run(pair[0], func(t *testing.T) {
			s, _, user, _ := testService(t)
			date, err := ParseDate(pair[0])
			require.NoError(t, err)
			task := createTask(t, s, user, date, "Carry across boundary")
			closed, err := s.Close(context.Background(), user, CloseRequest{Date: pair[0], TaskActions: []TaskAction{{task.ID, "tomorrow"}}})
			require.NoError(t, err)
			require.Equal(t, pair[1], closed.NextDate)
			require.Equal(t, pair[1], closed.Workflow.Tasks[0].PlannedForDate.Time.Format("2006-01-02"))
		})
	}
}
