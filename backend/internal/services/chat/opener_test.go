package chat

import (
	"testing"
	"time"

	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestOpenerText(t *testing.T) {
	carried := func(origin string) (generated.Task, string) {
		return generated.Task{ID: uuid.New(), Status: generated.TaskStatusPlanned, DeferCount: 1}, origin
	}
	fresh := generated.Task{ID: uuid.New(), Status: generated.TaskStatusPlanned}
	done := generated.Task{ID: uuid.New(), Status: generated.TaskStatusCompleted, Completed: true, DeferCount: 2}
	a, aOrigin := carried("2026-09-22")
	b, bOrigin := carried("2026-09-22")
	c, cOrigin := carried("2026-09-18")
	origins := map[string]string{a.ID.String(): aOrigin, b.ID.String(): bOrigin, c.ID.String(): cOrigin}
	morning := time.Date(2026, 9, 23, 8, 30, 0, 0, time.UTC)
	evening := time.Date(2026, 9, 23, 19, 0, 0, 0, time.UTC)

	cases := []struct {
		name  string
		date  string
		now   time.Time
		tasks []generated.Task
		want  string
	}{
		{"carried from yesterday and earlier", "2026-09-23", morning, []generated.Task{a, b, c, fresh, done}, "Morning. 3 tasks carried over, 2 from yesterday. What's on today?"},
		{"all carried from yesterday", "2026-09-23", morning, []generated.Task{a, b}, "Morning. 2 tasks carried over from yesterday. What's on today?"},
		{"one carried from earlier", "2026-09-23", morning, []generated.Task{c}, "Morning. 1 task carried over. What's on today?"},
		{"nothing carried", "2026-09-23", evening, []generated.Task{fresh, done}, "Evening. What's on today?"},
		{"future day", "2026-09-25", morning, []generated.Task{a}, "Planning Friday, Sep 25. What's on?"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			date, err := ParseDate(tc.date)
			require.NoError(t, err)
			got := openerText(date, tc.now, tc.tasks, origins)
			require.NotNil(t, got)
			require.Equal(t, tc.want, *got)
		})
	}
	past, err := ParseDate("2026-09-20")
	require.NoError(t, err)
	require.Nil(t, openerText(past, morning, []generated.Task{a}, origins))
}
