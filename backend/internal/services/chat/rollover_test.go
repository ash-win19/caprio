package chat

import (
	"context"
	"sync"
	"testing"
	"time"

	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/stretchr/testify/require"
)

func TestRolloverUsesTheCurrentLocalDate(t *testing.T) {
	now := time.Date(2026, 9, 17, 1, 0, 0, 0, time.UTC)
	date, err := LocalToday(now, "America/Los_Angeles")
	require.NoError(t, err)
	require.Equal(t, "2026-09-16", date.Time.Format("2006-01-02"))
	date, err = LocalToday(now, "Asia/Kolkata")
	require.NoError(t, err)
	require.Equal(t, "2026-09-17", date.Time.Format("2006-01-02"))
	_, err = LocalToday(now, "")
	require.Error(t, err)
	_, err = LocalToday(now, "not/a/timezone")
	require.Error(t, err)
}

func TestRolloverPreservesOriginsHistoryAndCheckboxesAcrossMissedDays(t *testing.T) {
	s, a, user, today := testService(t)
	ctx := context.Background()
	origin, _ := ParseDate("2026-09-01")
	yesterday, _ := ParseDate("2026-09-05")
	tomorrow, _ := ParseDate("2026-09-07")
	old := createTask(t, s, user, origin, "Older task")
	recent := createTask(t, s, user, yesterday, "Yesterday task")
	done := createTask(t, s, user, yesterday, "Checked yesterday")
	future := createTask(t, s, user, tomorrow, "Future task")
	inbox := createTask(t, s, user, origin, "Keep in inbox")
	_, err := s.store.Pool.Exec(ctx, `UPDATE tasks SET status='backlog' WHERE id=$1`, inbox.ID)
	require.NoError(t, err)
	_, err = s.store.Pool.Exec(ctx, `UPDATE tasks SET completed=true,status='completed',completed_at='2026-09-05T12:00:00Z' WHERE id=$1`, done.ID)
	require.NoError(t, err)
	// A draft cannot survive new arrivals that its task snapshot did not cover.
	draft := propose(t, s, a, user, today, planTask("New work"))
	var wg sync.WaitGroup
	errors := make([]error, 2)
	for i := range errors {
		wg.Add(1)
		go func() { defer wg.Done(); _, errors[i] = s.Rollover(ctx, user, today) }()
	}
	wg.Wait()
	for _, err := range errors {
		require.NoError(t, err)
	}
	w, err := s.Get(ctx, user, today)
	require.NoError(t, err)
	require.Len(t, w.Tasks, 2)
	require.Nil(t, w.Proposal)
	require.Nil(t, w.AvailableMinutes)
	require.Equal(t, "planning", w.State)
	require.Nil(t, w.OldestUnclosedDate)
	require.Equal(t, "2026-09-01", w.CarryoverOrigins[old.ID.String()])
	require.Equal(t, "2026-09-05", w.CarryoverOrigins[recent.ID.String()])
	for _, task := range w.Tasks {
		require.True(t, task.CarriedOver)
		require.False(t, task.Completed)
		require.EqualValues(t, 1, task.DeferCount, "concurrent requests must not carry a task twice")
	}
	_, err = s.Confirm(ctx, user, today, draft.Proposal.ID, draft.Version)
	require.ErrorIs(t, err, ErrConflict)
	archive, err := s.Get(ctx, user, yesterday)
	require.NoError(t, err)
	require.Equal(t, "closed", archive.State)
	require.True(t, archive.Review.Automatic)
	require.Equal(t, "2026-09-06", archive.Review.CarriedToDate)
	require.EqualValues(t, 1, archive.Review.CompletedCount)
	require.EqualValues(t, 1, archive.Review.CarriedToTomorrowCount)
	replayedClose, err := s.Close(ctx, user, CloseRequest{Date: "2026-09-01", TaskActions: []TaskAction{}})
	require.NoError(t, err)
	require.Equal(t, "2026-09-06", replayedClose.NextDate)
	savedDone, err := s.store.Queries.GetTaskByID(ctx, generated.GetTaskByIDParams{ID: done.ID, UserID: user})
	require.NoError(t, err)
	require.Equal(t, "2026-09-05T12:00:00Z", savedDone.CompletedAt.Time.UTC().Format(time.RFC3339))
	// Finish the recent carryover. Only the still-unchecked older task follows.
	_, err = s.store.Pool.Exec(ctx, `UPDATE tasks SET completed=true,status='completed',completed_at=clock_timestamp() WHERE id=$1`, recent.ID)
	require.NoError(t, err)
	next, err := s.Rollover(ctx, user, tomorrow)
	require.NoError(t, err)
	require.Len(t, next.Tasks, 2)
	require.Equal(t, "2026-09-01", next.CarryoverOrigins[old.ID.String()])
	for _, task := range next.Tasks {
		if task.ID == old.ID {
			require.EqualValues(t, 2, task.DeferCount)
		} else {
			require.Equal(t, future.ID, task.ID)
		}
	}
	require.Len(t, next.Backlog, 1)
	require.Equal(t, inbox.ID, next.Backlog[0].ID)
	history, err := s.Get(ctx, user, yesterday)
	require.NoError(t, err)
	require.Equal(t, archive.Tasks, history.Tasks, "later completion must not rewrite the original archive")
}

func TestRolloverLeavesAClosedDestinationAndOtherAccountsUntouched(t *testing.T) {
	s, _, user, today := testService(t)
	_, _, other, _ := testService(t)
	ctx := context.Background()
	yesterday, _ := ParseDate("2026-09-05")
	old := createTask(t, s, user, yesterday, "Wait for the next open day")
	foreign := createTask(t, s, other, yesterday, "Other account")
	_, err := s.Close(ctx, user, CloseRequest{Date: "2026-09-06", TaskActions: []TaskAction{}})
	require.NoError(t, err)
	w, err := s.Rollover(ctx, user, today)
	require.NoError(t, err)
	require.Equal(t, "closed", w.State)
	unchanged, err := s.store.Queries.GetTaskByID(ctx, generated.GetTaskByIDParams{ID: old.ID, UserID: user})
	require.NoError(t, err)
	require.Equal(t, yesterday, unchanged.PlannedForDate)
	tomorrow, _ := ParseDate("2026-09-07")
	_, err = s.Rollover(ctx, user, tomorrow)
	require.NoError(t, err)
	untouched, err := s.store.Queries.GetTaskByID(ctx, generated.GetTaskByIDParams{ID: foreign.ID, UserID: other})
	require.NoError(t, err)
	require.Equal(t, yesterday, untouched.PlannedForDate)
}
