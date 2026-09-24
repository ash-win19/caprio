package chat

import (
	"encoding/json"
	"errors"
	"testing"

	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func draftFixture(t *testing.T) (draftEnv, generated.Task, generated.Task) {
	t.Helper()
	date, err := ParseDate("2026-09-23")
	require.NoError(t, err)
	phenyx := generated.Task{ID: uuid.New(), Title: "Ship Phenyx", Status: generated.TaskStatusPlanned, PlannedForDate: date, Urgency: generated.UrgencyLevelMedium, DeferCount: 1, CarriedOver: true}
	report := generated.Task{ID: uuid.New(), Title: "Write report", Status: generated.TaskStatusPlanned, PlannedForDate: date, Urgency: generated.UrgencyLevelMedium, Duration: ptr(int32(30))}
	env := draftEnv{Date: date, Owned: []generated.Task{phenyx, report}, Writable: func(pgtype.Date) error { return nil }}
	return env, phenyx, report
}

func raw(v any) json.RawMessage { b, _ := json.Marshal(v); return b }

func codeOf(err error) string {
	var v *ValidationError
	if errors.As(err, &v) {
		return v.Code
	}
	return ""
}

func TestDraftAccumulatesAcrossTurnsAndCatchesDuplicates(t *testing.T) {
	env, phenyx, _ := draftFixture(t)
	d := newDraft()
	turn1, turn2 := uuid.New(), uuid.New()

	slides, err := d.AddTask(env, turn1, AddTaskInput{Title: "Ship slides and prepare for demo"})
	require.NoError(t, err)
	require.Equal(t, "added", slides.Status)
	dup, err := d.AddTask(env, turn1, AddTaskInput{Title: "ship phenyx"})
	require.NoError(t, err)
	require.Equal(t, "exists", dup.Status)
	require.Equal(t, phenyx.ID.String(), dup.Existing.Ref)
	require.True(t, dup.Existing.Carried)

	sleep, err := d.AddTask(env, turn2, AddTaskInput{Title: "Sleep early"})
	require.NoError(t, err)
	again, err := d.AddTask(env, turn2, AddTaskInput{Title: "Sleep early!"})
	require.NoError(t, err)
	require.Equal(t, "exists", again.Status, "a task already in the draft is not added twice")
	require.Equal(t, sleep.Ref, again.Existing.Ref)

	ops := d.ToOperations()
	require.Len(t, ops, 2)
	require.Equal(t, "create", ops[0].Kind)
	require.JSONEq(t, `"Ship slides and prepare for demo"`, string(ops[0].Fields["title"]))
	require.Equal(t, "2026-09-23", ops[0].Date)
	require.JSONEq(t, `"Sleep early"`, string(ops[1].Fields["title"]))
	require.Equal(t, []uuid.UUID{turn2}, d.Entries[sleep.Ref].Turns)
}

func TestDraftMergesLaterChangesIntoOneEntryPerTask(t *testing.T) {
	env, _, report := draftFixture(t)
	d := newDraft()
	turn := uuid.New()
	sleep, err := d.AddTask(env, turn, AddTaskInput{Title: "Sleep early"})
	require.NoError(t, err)
	_, err = d.EditTask(env, turn, sleep.Ref, map[string]json.RawMessage{"description": raw("Lights out by 10pm")})
	require.NoError(t, err)
	_, err = d.MoveTask(env, turn, sleep.Ref, "2026-09-24", false)
	require.NoError(t, err)
	ops := d.ToOperations()
	require.Len(t, ops, 1)
	require.Equal(t, "create", ops[0].Kind)
	require.Equal(t, "2026-09-24", ops[0].Date)
	require.JSONEq(t, `"Lights out by 10pm"`, string(ops[0].Fields["description"]))

	removed, err := d.RemoveTask(env, turn, sleep.Ref)
	require.NoError(t, err)
	require.Equal(t, "removed", removed.Status)
	require.Empty(t, d.ToOperations(), "removing a task created in the draft drops it entirely")

	ref := report.ID.String()
	_, err = d.EditTask(env, turn, ref, map[string]json.RawMessage{"duration": raw(60)})
	require.NoError(t, err)
	_, err = d.EditTask(env, turn, ref, map[string]json.RawMessage{"title": raw("Write the report")})
	require.NoError(t, err)
	ops = d.ToOperations()
	require.Len(t, ops, 1)
	require.Equal(t, "update", ops[0].Kind)
	require.Equal(t, &report.ID, ops[0].TaskID)
	require.Len(t, ops[0].Fields, 2)

	_, err = d.EditTask(env, turn, ref, map[string]json.RawMessage{"duration": raw(30), "title": raw("Write report")})
	require.NoError(t, err)
	require.Empty(t, d.ToOperations(), "edits back to the saved values leave no change")
	require.Empty(t, d.Entries)
}

func TestDraftRemovalRevertAndConflicts(t *testing.T) {
	env, phenyx, report := draftFixture(t)
	d := newDraft()
	turn := uuid.New()
	ref := report.ID.String()
	_, err := d.EditTask(env, turn, ref, map[string]json.RawMessage{"duration": raw(45)})
	require.NoError(t, err)
	_, err = d.RemoveTask(env, turn, ref)
	require.NoError(t, err)
	require.Equal(t, "remove", d.ToOperations()[0].Kind)
	_, err = d.EditTask(env, turn, ref, map[string]json.RawMessage{"title": raw("Renamed")})
	require.Equal(t, "restore_first", codeOf(err))

	reverted, err := d.RevertChange(ref)
	require.NoError(t, err)
	require.Equal(t, "reverted", reverted.Status)
	ops := d.ToOperations()
	require.Len(t, ops, 1)
	require.Equal(t, "update", ops[0].Kind, "undo restores the change before the removal")
	_, err = d.RevertChange(ref)
	require.NoError(t, err)
	require.Empty(t, d.Entries)

	_, err = d.EditTask(env, turn, "new:"+uuid.NewString(), map[string]json.RawMessage{"title": raw("x")})
	require.Equal(t, "unknown_task", codeOf(err))
	_, err = d.EditTask(env, turn, ref, map[string]json.RawMessage{"status": raw("done")})
	require.Error(t, err)
	_, err = d.MoveTask(env, turn, phenyx.ID.String(), "", true)
	require.NoError(t, err)
	require.True(t, d.ToOperations()[0].Inbox)
	_, err = d.SetCompleted(env, turn, phenyx.ID.String(), true)
	require.Equal(t, "conflicting_change", codeOf(err))
	done, err := d.SetCompleted(env, turn, ref, true)
	require.NoError(t, err)
	require.Equal(t, "updated", done.Status)
	require.Equal(t, "complete", d.ToOperations()[1].Kind)
}

func TestPlanViewShowsTheFullResultingPlanWithBadges(t *testing.T) {
	env, phenyx, report := draftFixture(t)
	done := generated.Task{ID: uuid.New(), Title: "Standup", Status: generated.TaskStatusCompleted, Completed: true, PlannedForDate: env.Date, Urgency: generated.UrgencyLevelMedium}
	inbox := generated.Task{ID: uuid.New(), Title: "Read paper", Status: generated.TaskStatusBacklog, PlannedForDate: env.Date, Urgency: generated.UrgencyLevelMedium}
	env.Owned = append(env.Owned, done, inbox)
	origins := map[string]string{phenyx.ID.String(): "2026-09-20"}

	require.Nil(t, buildPlanView(env, nil, origins), "no draft, no plan")

	d := newDraft()
	turn := uuid.New()
	slides, _ := d.AddTask(env, turn, AddTaskInput{Title: "Ship slides"})
	_, _ = d.AddTask(env, turn, AddTaskInput{Title: "Book flights", Date: "2026-09-25"})
	_, _ = d.EditTask(env, turn, report.ID.String(), map[string]json.RawMessage{"duration": raw(60)})
	_, _ = d.MoveTask(env, turn, inbox.ID.String(), "", false)

	view := buildPlanView(env, d, origins)
	require.NotNil(t, view)
	require.Equal(t, d.ID, view.DraftID)
	titles := func(items []PlanItem) []string {
		out := []string{}
		for _, i := range items {
			out = append(out, i.Title+"|"+i.Badge)
		}
		return out
	}
	require.Equal(t, []string{"Write report|edited", "Ship slides|new", "Read paper|moved"}, titles(view.Today))
	require.Equal(t, []string{"Ship Phenyx|"}, titles(view.Carried))
	require.Equal(t, "2026-09-20", view.Carried[0].CarriedSince)
	require.Equal(t, []string{"Book flights|new"}, titles(view.OtherDays))
	require.Equal(t, "2026-09-25", view.OtherDays[0].Date)
	require.Equal(t, 1, view.DoneCount)
	require.Equal(t, PlanCounts{New: 2, Edited: 1, Moved: 1, Carried: 1}, view.Counts)
	require.Equal(t, int32(60), *view.Today[0].Duration)
	require.Equal(t, slides.Ref, view.Today[1].Ref)

	_, _ = d.RemoveTask(env, turn, phenyx.ID.String())
	_, _ = d.MoveTask(env, turn, report.ID.String(), "2026-09-24", false)
	view = buildPlanView(env, d, origins)
	require.Equal(t, []string{"Ship Phenyx|removed"}, titles(view.Carried))
	require.Equal(t, []string{"Ship slides|new", "Read paper|moved"}, titles(view.Today))
	require.Equal(t, []string{"Write report|moved", "Book flights|new"}, titles(view.OtherDays))
	require.Equal(t, 1, view.Counts.Removed)
}
