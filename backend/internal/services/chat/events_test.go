package chat

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"
)

type observingHandler struct {
	slog.Handler
	observe func(slog.Record)
}

func (h observingHandler) Handle(ctx context.Context, record slog.Record) error {
	h.observe(record)
	return h.Handler.Handle(ctx, record)
}

func TestConcurrentSuccessEventsObserveCommittedState(t *testing.T) {
	s, a, user, date := testService(t)
	ctx := context.Background()
	var output bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(observingHandler{
		Handler: slog.NewJSONHandler(&output, nil),
		observe: func(record slog.Record) {
			var event string
			var version int64
			record.Attrs(func(attr slog.Attr) bool {
				if attr.Key == "event" {
					event = attr.Value.String()
				}
				if attr.Key == "workflow_version" {
					version = attr.Value.Int64()
				}
				return true
			})
			var state string
			var committedVersion int64
			// This separate connection cannot see the writer's uncommitted state.
			err := s.store.Pool.QueryRow(ctx, `SELECT state,version FROM daily_plans WHERE user_id=$1 AND plan_date=$2`, user, date).Scan(&state, &committedVersion)
			if err != nil {
				t.Errorf("read committed event state: %v", err)
				return
			}
			want := "closed"
			if event == "plan_confirmed" {
				want = "active"
			}
			if state != want || committedVersion != version {
				t.Errorf("event %s preceded commit: state=%s version=%d, want %s/%d", event, state, committedVersion, want, version)
			}
		},
	}))
	t.Cleanup(func() { slog.SetDefault(previous) })
	concurrent := func(run func() error) {
		t.Helper()
		var wg sync.WaitGroup
		errs := make([]error, 2)
		for i := range errs {
			wg.Add(1)
			go func() { defer wg.Done(); errs[i] = run() }()
		}
		wg.Wait()
		for _, err := range errs {
			require.NoError(t, err)
		}
	}
	draft := propose(t, s, a, user, date, planTask("Private title"))
	concurrent(func() error { _, err := s.Confirm(ctx, user, date, draft.Proposal.ID, draft.Version); return err })
	w, err := s.Get(ctx, user, date)
	require.NoError(t, err)
	req := CloseRequest{Date: w.Date, Notes: ptr("Private notes"), TaskActions: []TaskAction{{w.Tasks[0].ID, "done"}}}
	concurrent(func() error { _, err := s.Close(ctx, user, req); return err })
	require.Equal(t, 1, strings.Count(output.String(), `"event":"plan_confirmed"`))
	require.Equal(t, 1, strings.Count(output.String(), `"event":"day_closed"`))
	require.NotContains(t, output.String(), "tasks_carried", "zero carries must emit no carry event")
	require.NotContains(t, output.String(), "Private")
}

func TestSuccessEventsOnlyForCommittedTransitions(t *testing.T) {
	var output bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&output, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })
	s, a, user, date := testService(t)
	ctx := context.Background()
	draft := propose(t, s, a, user, date, planTask("Private task title"))
	confirmed, err := s.Confirm(ctx, user, date, draft.Proposal.ID, draft.Version)
	require.NoError(t, err)
	_, err = s.Confirm(ctx, user, date, draft.Proposal.ID, draft.Version)
	require.NoError(t, err)
	request := CloseRequest{Date: "2026-09-06", TaskActions: []TaskAction{{confirmed.Tasks[0].ID, "tomorrow"}}}
	_, err = s.Close(ctx, user, request)
	require.NoError(t, err)
	_, err = s.Close(ctx, user, request)
	require.NoError(t, err)
	var events []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(output.String()), "\n") {
		if line == "" {
			continue
		}
		var event map[string]any
		require.NoError(t, json.Unmarshal([]byte(line), &event))
		events = append(events, event)
	}
	require.Len(t, events, 3)
	require.Equal(t, "plan_confirmed", events[0]["event"])
	require.Equal(t, "day_closed", events[1]["event"])
	require.Equal(t, "tasks_carried", events[2]["event"])
	for _, event := range events {
		require.Equal(t, user.String(), event["user_id"])
		require.Equal(t, "2026-09-06", event["plan_date"])
		require.EqualValues(t, 1, event["task_count"])
	}
	require.Equal(t, "2026-09-07", events[2]["destination_date"])
	require.NotContains(t, output.String(), "Private task title")
	beforeFailure := output.String()
	_, err = s.store.Pool.Exec(ctx, `INSERT INTO daily_plans(user_id,plan_date,state) VALUES($1,'2026-09-08','closed')`, user)
	require.NoError(t, err)
	request.Date = "2026-09-07"
	_, err = s.Close(ctx, user, request)
	require.Error(t, err)
	require.Equal(t, beforeFailure, output.String(), "rolled-back close must not emit success")
}
