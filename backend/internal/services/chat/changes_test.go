package chat

import (
	"context"
	"encoding/json"
	"sync"
	"testing"

	
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func fields(values map[string]any) map[string]json.RawMessage {
	result := map[string]json.RawMessage{}
	for key, value := range values {
		result[key], _ = json.Marshal(value)
	}
	return result
}
func command(t *testing.T, s *Service, a *fakeAgent, user uuid.UUID, date pgtype.Date, ops ...TaskOperation) *ProcessResponse {
	t.Helper()
	for i := range ops {
		ops[i].Quote = "Do this"
	}
	a.response = encode(t, AgentReply{ContractVersion: 2, Message: "Your request is ready.", Phase: "actions", Tasks: []ProposalTask{}, Operations: ops})
	draft, err := s.Process(context.Background(), ProcessRequest{UserID: user, SessionDate: date, Content: "Do this", RequestID: uuid.New(), ContractVersion: 2})
	require.NoError(t, err)
	require.Nil(t, draft.AppliedChange)
	require.NotNil(t, draft.Workflow.Proposal)
	proposalID := draft.Workflow.Proposal.ID
	confirmed, err := s.Confirm(context.Background(), user, date, proposalID, draft.Workflow.Version)
	require.NoError(t, err)
	result := &ProcessResponse{Text: draft.Text, Workflow: confirmed}
	for i := range confirmed.ChangeReceipts {
		if confirmed.ChangeReceipts[i].RequestID == proposalID && !confirmed.ChangeReceipts[i].Undone {
			result.AppliedChange = &confirmed.ChangeReceipts[i]
			break
		}
	}
	require.NotNil(t, result.AppliedChange)
	return result
}
func add(title string) TaskOperation {
	return TaskOperation{Kind: "create", Fields: fields(map[string]any{"title": title, "duration": 120})}
}

func TestChatActionsBecomeDraftUntilConfirm(t *testing.T) {
	s, a, user, _ := testService(t)
	ctx := context.Background()
	date := CurrentDate(ctx)
	op := add("Draft report")
	op.Quote = "Draft report"
	a.response = encode(t, AgentReply{ContractVersion: 2, Message: "Review this draft.", Phase: "actions", Tasks: []ProposalTask{}, Operations: []TaskOperation{op}})
	draft, err := s.Process(ctx, ProcessRequest{UserID: user, SessionDate: date, Content: "Draft report", RequestID: uuid.New(), ContractVersion: 2})
	require.NoError(t, err)
	require.Nil(t, draft.AppliedChange)
	require.NotNil(t, draft.Workflow.Proposal)
	require.Empty(t, draft.Workflow.Tasks)
	require.Equal(t, "planning", draft.Workflow.State)
	confirmed, err := s.Confirm(ctx, user, date, draft.Workflow.Proposal.ID, draft.Workflow.Version)
	require.NoError(t, err)
	require.Nil(t, confirmed.Proposal)
	require.Len(t, confirmed.Tasks, 1)
	require.Equal(t, "Draft report", confirmed.Tasks[0].Title)
	require.Equal(t, "active", confirmed.State)
}

func TestCommandsReuseFiveTasksBeyondCapacityAndAppend(t *testing.T) {
	s, a, user, _ := testService(t)
	ctx := context.Background()
	date := CurrentDate(ctx)
	titles := []string{"Ship workflow", "Fix publishing", "Restore Headlines brand and speed publishing", "Research Claude decks", "Prepare demo"}
	ids := map[string]uuid.UUID{}
	for i, title := range titles {
		task := createTask(t, s, user, date, title)
		ids[title] = task.ID
		if i > 0 {
			_, err := s.store.Pool.Exec(ctx, `UPDATE tasks SET status='backlog',duration=120 WHERE id=$1`, task.ID)
			require.NoError(t, err)
		}
	}
	_, err := s.store.Pool.Exec(ctx, `INSERT INTO daily_plans(user_id,plan_date,state,available_minutes) VALUES($1,$2,'active',120)`, user, date)
	require.NoError(t, err)
	done := createTask(t, s, user, date, "Earlier completed work")
	_, err = s.store.Pool.Exec(ctx, `UPDATE tasks SET completed=true,status='completed',completed_at=clock_timestamp() WHERE id=$1`, done.ID)
	require.NoError(t, err)
	ops := []TaskOperation{}
	for _, title := range titles {
		ops = append(ops, add(title))
	}
	r := command(t, s, a, user, date, ops...)
	require.Len(t, r.Workflow.Tasks, 6)
	require.Empty(t, r.Workflow.Backlog)
	require.NotNil(t, r.AppliedChange)
	require.Nil(t, r.Workflow.Proposal)
	require.EqualValues(t, 120, *r.Workflow.AvailableMinutes)
	for _, task := range r.Workflow.Tasks {
		if task.ID == done.ID {
			require.True(t, task.Completed)
		} else {
			require.Equal(t, ids[task.Title], task.ID)
		}
	}
	next := command(t, s, a, user, date, add("Test workflow"), add("Polish demo"))
	require.Len(t, next.Workflow.Tasks, 8)
	reloaded, err := s.Get(ctx, user, date)
	require.NoError(t, err)
	require.Len(t, reloaded.ChangeReceipts, 2)
	undone, err := s.Undo(ctx, user, next.AppliedChange.ID)
	require.NoError(t, err)
	require.Len(t, undone.Tasks, 6)
	again, err := s.Undo(ctx, user, next.AppliedChange.ID)
	require.NoError(t, err)
	require.Equal(t, undone.Tasks, again.Tasks)
	restored, err := s.Undo(ctx, user, r.AppliedChange.ID)
	require.NoError(t, err)
	require.Len(t, restored.Backlog, 4)
	require.Len(t, restored.Tasks, 2)
}

func TestCommandRetryIsAtomicAndReturnsSameDraft(t *testing.T) {
	s, a, user, _ := testService(t)
	ctx := context.Background()
	date := CurrentDate(ctx)
	op := add("Ship it")
	op.Quote = "Ship it"
	a.response = encode(t, AgentReply{ContractVersion: 2, Message: "Ready", Phase: "actions", Tasks: []ProposalTask{}, Operations: []TaskOperation{op}})
	req := ProcessRequest{UserID: user, SessionDate: date, Content: "Ship it", RequestID: uuid.New(), ContractVersion: 2}
	out := make([]*ProcessResponse, 2)
	errs := make([]error, 2)
	var wg sync.WaitGroup
	for i := range 2 {
		wg.Add(1)
		go func() { defer wg.Done(); out[i], errs[i] = s.Process(ctx, req) }()
	}
	wg.Wait()
	require.NoError(t, errs[0])
	require.NoError(t, errs[1])
	require.Equal(t, 1, a.calls)
	require.Nil(t, out[0].AppliedChange)
	require.NotNil(t, out[0].Workflow.Proposal)
	require.Equal(t, out[0].Workflow.Proposal.ID, out[1].Workflow.Proposal.ID)
	require.Empty(t, out[0].Workflow.Tasks)
	confirmed, err := s.Confirm(ctx, user, date, out[0].Workflow.Proposal.ID, out[0].Workflow.Version)
	require.NoError(t, err)
	require.Len(t, confirmed.Tasks, 1)
	require.NotEmpty(t, confirmed.ChangeReceipts)
	receipt := confirmed.ChangeReceipts[0]
	require.True(t, receipt.CanUndo, "JSON roundtrip must preserve a comparable task snapshot")
	_, err = s.Undo(ctx, user, receipt.ID)
	require.NoError(t, err)
	replay, err := s.Process(ctx, req)
	require.NoError(t, err)
	require.Nil(t, replay.AppliedChange)
	require.Empty(t, replay.Workflow.Tasks)
}

func TestOperationsValidateOwnershipQuoteAndFieldPresence(t *testing.T) {
	s, a, user, _ := testService(t)
	ctx := context.Background()
	date := CurrentDate(ctx)
	task := createTask(t, s, user, date, "Preserve me")
	op := TaskOperation{Kind: "update", TaskID: &task.ID, Fields: fields(map[string]any{"duration": nil, "description": "Keep brand behavior; speed up publishing per Cozad."})}
	r := command(t, s, a, user, date, op)
	require.Nil(t, r.Workflow.Tasks[0].Duration)
	require.NotNil(t, r.Workflow.Tasks[0].Description)
	undone, err := s.Undo(ctx, user, r.AppliedChange.ID)
	require.NoError(t, err)
	require.Equal(t, task.Duration, undone.Tasks[0].Duration)
	require.Nil(t, undone.Tasks[0].Description)
	rejectedOnChat := []TaskOperation{
		{Kind: "remove", TaskID: ptr(uuid.New()), Quote: "Do this"},
		{Kind: "create", Quote: "not in the request", Fields: fields(map[string]any{"title": "Invented task"})},
		{Kind: "update", TaskID: &task.ID, Quote: "Do this", Fields: fields(map[string]any{"sortOrder": 0})},
	}
	for _, bad := range rejectedOnChat {
		a.response = encode(t, AgentReply{ContractVersion: 2, Message: "Ready", Phase: "actions", Tasks: []ProposalTask{}, Operations: []TaskOperation{bad}})
		_, err := s.Process(ctx, ProcessRequest{UserID: user, SessionDate: date, Content: "Do this", RequestID: uuid.New(), ContractVersion: 2})
		require.Error(t, err)
	}
	for _, bad := range []TaskOperation{
		{Kind: "update", TaskID: &task.ID, Quote: "Do this", Fields: fields(map[string]any{"categoryId": uuid.New()})},
		{Kind: "update", TaskID: &task.ID, Quote: "Do this", Fields: fields(map[string]any{"title": nil})},
	} {
		a.response = encode(t, AgentReply{ContractVersion: 2, Message: "Ready", Phase: "actions", Tasks: []ProposalTask{}, Operations: []TaskOperation{bad}})
		draftBad, err := s.Process(ctx, ProcessRequest{UserID: user, SessionDate: date, Content: "Do this", RequestID: uuid.New(), ContractVersion: 2})
		require.NoError(t, err)
		_, err = s.Confirm(ctx, user, date, draftBad.Workflow.Proposal.ID, draftBad.Workflow.Version)
		require.Error(t, err)
	}
	w, err := s.Get(ctx, user, date)
	require.NoError(t, err)
	require.Len(t, w.Tasks, 1)
}

func TestUndoDoesNotOverwriteLaterEditsOrReviews(t *testing.T) {
	s, a, user, _ := testService(t)
	ctx := context.Background()
	date := CurrentDate(ctx)
	r := command(t, s, a, user, date, add("Report"))
	id := r.Workflow.Tasks[0].ID
	_, err := s.store.Pool.Exec(ctx, `UPDATE tasks SET completed=true,status='completed',completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1`, id)
	require.NoError(t, err)
	_, err = s.Undo(ctx, user, r.AppliedChange.ID)
	require.Error(t, err)
	w, err := s.Get(ctx, user, date)
	require.NoError(t, err)
	require.True(t, w.Tasks[0].Completed)
	require.False(t, w.ChangeReceipts[0].CanUndo)
	other := command(t, s, a, user, date, add("Another task"))
	_, err = s.Close(ctx, user, CloseRequest{Date: w.Date, TaskActions: []TaskAction{{id, "done"}, {other.AppliedChange.Changes[0].TaskID, "tomorrow"}}})
	require.NoError(t, err)
	_, err = s.Undo(ctx, user, other.AppliedChange.ID)
	require.Error(t, err)
}

func TestCurrentDayCanReopenAndCloseWithImmutableReviews(t *testing.T) {
	s, a, user, _ := testService(t)
	ctx := context.Background()
	date := CurrentDate(ctx)
	dateText := date.Time.Format("2006-01-02")
	done := createTask(t, s, user, date, "Done already")
	carry := createTask(t, s, user, date, "Carry this")
	closed, err := s.Close(ctx, user, CloseRequest{Date: dateText, Notes: ptr("First review"), TaskActions: []TaskAction{{done.ID, "done"}, {carry.ID, "tomorrow"}}})
	require.NoError(t, err)
	require.Len(t, closed.Workflow.ReviewHistory, 1)
	a.response = encode(t, AgentReply{ContractVersion: 2, Message: "What work?", Phase: "clarifying", Tasks: []ProposalTask{}})
	question, err := s.Process(ctx, ProcessRequest{UserID: user, SessionDate: date, Content: "Maybe more", RequestID: uuid.New(), ContractVersion: 2})
	require.NoError(t, err)
	require.Equal(t, "closed", question.Workflow.State)
	r := command(t, s, a, user, date, add("Late addition"))
	require.Equal(t, "active", r.Workflow.State)
	require.Len(t, r.Workflow.Tasks, 2)
	require.Len(t, r.Workflow.ReviewHistory, 1)
	for _, task := range r.Workflow.Tasks {
		require.NotEqual(t, carry.ID, task.ID)
		if task.ID == done.ID {
			require.True(t, task.Completed)
		}
	}
	undone, err := s.Undo(ctx, user, r.AppliedChange.ID)
	require.NoError(t, err)
	require.Equal(t, "closed", undone.State)
	require.Len(t, undone.ReviewHistory, 1)
	second := command(t, s, a, user, date, add("Evening task"))
	newID := second.AppliedChange.Changes[0].TaskID
	closedAgain, err := s.Close(ctx, user, CloseRequest{Date: dateText, Notes: ptr("Second review"), TaskActions: []TaskAction{{done.ID, "done"}, {newID, "done"}}})
	require.NoError(t, err)
	require.Len(t, closedAgain.Workflow.ReviewHistory, 2)
	require.Equal(t, "First review", closedAgain.Workflow.ReviewHistory[0].Review.Notes)
	require.EqualValues(t, 2, closedAgain.CompletedCount)
	require.EqualValues(t, 1, closedAgain.CarriedToTomorrowCount)
	require.Len(t, closedAgain.Workflow.Tasks, 3)
	require.Equal(t, closed.Session.ID, closedAgain.Session.ID)
	next, _ := ParseDate(closed.NextDate)
	tomorrow, err := s.Get(ctx, user, next)
	require.NoError(t, err)
	require.Len(t, tomorrow.Tasks, 1)
	require.Equal(t, carry.ID, tomorrow.Tasks[0].ID)
	require.EqualValues(t, 1, tomorrow.Tasks[0].DeferCount)
}

func TestSuggestionsWaitAndDatesUseTheServerClock(t *testing.T) {
	s, a, user, _ := testService(t)
	ctx := context.Background()
	today := CurrentDate(ctx)
	future := pgtype.Date{Time: today.Time.AddDate(0, 0, 2), Valid: true}
	op := add("Future task")
	op.Date = future.Time.Format("2006-01-02")
	r := command(t, s, a, user, today, op)
	require.Empty(t, r.Workflow.Tasks)
	require.Equal(t, []string{op.Date}, r.AppliedChange.AffectedDates)
	_, err := s.Undo(ctx, user, r.AppliedChange.ID)
	require.NoError(t, err)
	task := createTask(t, s, user, today, "Keep until approved")
	suggestion := TaskOperation{Kind: "remove", TaskID: &task.ID}
	a.response = encode(t, AgentReply{ContractVersion: 2, Message: "I suggest removing this task. Review it.", Phase: "proposal", Tasks: []ProposalTask{}, Operations: []TaskOperation{suggestion}})
	draft, err := s.Process(ctx, ProcessRequest{UserID: user, SessionDate: today, Content: "What can I cut?", RequestID: uuid.New(), ContractVersion: 2})
	require.NoError(t, err)
	require.Len(t, draft.Workflow.Tasks, 1)
	require.Nil(t, draft.AppliedChange)
	w := draft.Workflow
	confirmed, err := s.Confirm(ctx, user, today, w.Proposal.ID, w.Version)
	require.NoError(t, err)
	require.Empty(t, confirmed.Tasks)
	again, err := s.Confirm(ctx, user, today, w.Proposal.ID, w.Version)
	require.NoError(t, err)
	require.Equal(t, confirmed.Tasks, again.Tasks)
	past := pgtype.Date{Time: today.Time.AddDate(0, 0, -1), Valid: true}
	_, err = s.Process(ctx, ProcessRequest{UserID: user, SessionDate: past, Content: "Add work", RequestID: uuid.New(), ContractVersion: 2})
	require.Error(t, err)
	bad := add("Past task")
	bad.Date = past.Time.Format("2006-01-02")
	bad.Quote = "Do this"
	a.response = encode(t, AgentReply{ContractVersion: 2, Message: "Ready", Phase: "actions", Tasks: []ProposalTask{}, Operations: []TaskOperation{bad}})
	draftPast, err := s.Process(ctx, ProcessRequest{UserID: user, SessionDate: today, Content: "Do this", RequestID: uuid.New(), ContractVersion: 2})
	require.NoError(t, err)
	require.NotNil(t, draftPast.Workflow.Proposal)
	_, err = s.Confirm(ctx, user, today, draftPast.Workflow.Proposal.ID, draftPast.Workflow.Version)
	require.Error(t, err)
}

func TestCompletedDuplicateNeedsAnExplicitNewOccurrence(t *testing.T) {
	s, a, user, _ := testService(t)
	ctx := context.Background()
	date := CurrentDate(ctx)
	task := createTask(t, s, user, date, "Exercise")
	_, err := s.store.Pool.Exec(ctx, `UPDATE tasks SET completed=true,status='completed' WHERE id=$1`, task.ID)
	require.NoError(t, err)
	op := add("Exercise")
	op.Quote = "Exercise"
	a.response = encode(t, AgentReply{ContractVersion: 2, Message: "Ready", Phase: "actions", Tasks: []ProposalTask{}, Operations: []TaskOperation{op}})
	draftDup, err := s.Process(ctx, ProcessRequest{UserID: user, SessionDate: date, Content: "Exercise", RequestID: uuid.New(), ContractVersion: 2})
	require.NoError(t, err)
	require.NotNil(t, draftDup.Workflow.Proposal)
	_, err = s.Confirm(ctx, user, date, draftDup.Workflow.Proposal.ID, draftDup.Workflow.Version)
	require.Error(t, err)
	op.NewOccurrence = true
	r := command(t, s, a, user, date, op)
	require.Len(t, r.Workflow.Tasks, 2)
	for _, item := range r.Workflow.Tasks {
		if item.ID == task.ID {
			require.True(t, item.Completed)
		}
	}
}
