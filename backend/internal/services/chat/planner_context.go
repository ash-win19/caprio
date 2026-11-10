package chat

import (
	"encoding/json"

	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/google/uuid"
)

// Each owned task appears once. Persistence metadata and duplicate day/Inbox
// copies consumed the fallback model's input budget on ordinary accounts. A
// Carried task on the conversation day says how many Days it has rolled
// forward, and whether that makes it a Stale task.
func operationContext(w *Workflow, owned []generated.Task, today string, referenced *uuid.UUID) []byte {
	type task struct {
		ID          uuid.UUID            `json:"id"`
		Title       string               `json:"title"`
		Description *string              `json:"description,omitempty"`
		Duration    *int32               `json:"duration,omitempty"`
		Date        string               `json:"plannedForDate"`
		Status      generated.TaskStatus `json:"status"`
		Completed   bool                 `json:"completed,omitempty"`
		DueDate     string               `json:"dueDate,omitempty"`
		CarriedDays int                  `json:"carriedDays,omitempty"`
		Stale       bool                 `json:"stale,omitempty"`
	}
	tasks := make([]task, 0, len(owned))
	for _, t := range owned {
		if t.Status == generated.TaskStatusDropped {
			continue
		}
		days := 0
		if t.PlannedForDate.Time.Format("2006-01-02") == w.Date {
			days = carriedDays(t, w.CarryoverOrigins)
		}
		item := task{ID: t.ID, Title: t.Title, Description: t.Description, Duration: t.Duration, Date: t.PlannedForDate.Time.Format("2006-01-02"), Status: t.Status, Completed: t.Completed, CarriedDays: days, Stale: isStale(days)}
		if t.DueDate.Valid {
			item.DueDate = t.DueDate.Time.Format("2006-01-02")
		}
		tasks = append(tasks, item)
	}
	// plan is the day's draft applied to saved work; refs in it and task IDs in
	// ownedTasks are what the planner tools accept.
	raw, _ := json.Marshal(map[string]any{"date": w.Date, "localToday": today, "referencedTaskId": referenced, "state": w.State, "ownedTasks": tasks, "availableMinutes": w.AvailableMinutes, "plan": w.Plan})
	return raw
}
