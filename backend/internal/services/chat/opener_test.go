package chat

import (
	"testing"
	"time"

	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestOpenerText(t *testing.T) {
	day, err := ParseDate("2026-09-23")
	require.NoError(t, err)
	origins := map[string]string{}
	carried := func(title, origin string) generated.Task {
		task := generated.Task{ID: uuid.New(), Title: title, Status: generated.TaskStatusPlanned, DeferCount: 1, PlannedForDate: day}
		origins[task.ID.String()] = origin
		return task
	}
	fresh := generated.Task{ID: uuid.New(), Title: "New today", Status: generated.TaskStatusPlanned, PlannedForDate: day}
	done := generated.Task{ID: uuid.New(), Title: "Finished", Status: generated.TaskStatusCompleted, Completed: true, DeferCount: 2, PlannedForDate: day}
	reading := carried("Read chapter 7", "2026-09-22")
	bank := carried("Call the bank", "2026-09-22")
	resume := carried("Update résumé", "2026-09-18")
	taxes := carried("File taxes", "2026-09-16")
	edge := carried("Book dentist", "2026-09-20")
	old := []generated.Task{carried("A", "2026-09-10"), carried("B", "2026-09-11"), carried("C", "2026-09-12"), carried("D", "2026-09-13"), carried("E", "2026-09-14"), carried("F", "2026-09-15")}
	morning := time.Date(2026, 9, 23, 8, 30, 0, 0, time.UTC)
	evening := time.Date(2026, 9, 23, 19, 0, 0, 0, time.UTC)

	cases := []struct {
		name  string
		date  string
		now   time.Time
		tasks []generated.Task
		want  string
	}{
		{"names carried tasks and the stale one", "2026-09-23", morning, []generated.Task{reading, bank, resume, fresh, done}, "Morning. 3 tasks carried over: Read chapter 7, Call the bank and Update résumé. Update résumé has carried over for 5 days. What's on today?"},
		{"all carried from yesterday", "2026-09-23", morning, []generated.Task{reading, bank}, "Morning. 2 tasks carried over from yesterday: Read chapter 7 and Call the bank. What's on today?"},
		{"one stale task", "2026-09-23", morning, []generated.Task{resume}, "Morning. 1 task carried over: Update résumé. It has carried over for 5 days. What's on today?"},
		{"stale starts at three days", "2026-09-23", morning, []generated.Task{edge, reading}, "Morning. 2 tasks carried over: Book dentist and Read chapter 7. Book dentist has carried over for 3 days. What's on today?"},
		{"several stale tasks, oldest first", "2026-09-23", morning, []generated.Task{resume, taxes}, "Morning. 2 tasks carried over: Update résumé and File taxes. File taxes has carried over for 7 days and Update résumé for 5. What's on today?"},
		{"long lists are cut short", "2026-09-23", morning, old, "Morning. 6 tasks carried over: A, B, C, D, E and 1 more. A has carried over for 13 days, B for 12 and C for 11, and 3 more for 3 days or longer. What's on today?"},
		{"nothing carried", "2026-09-23", evening, []generated.Task{fresh, done}, "Evening. What's on today?"},
		{"future day", "2026-09-25", morning, []generated.Task{reading}, "Planning Friday, Sep 25. What's on?"},
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
	require.Nil(t, openerText(past, morning, []generated.Task{reading}, origins))
}
