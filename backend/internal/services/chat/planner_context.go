package chat

import (
	"encoding/json"

	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/google/uuid"
)

// Each owned task appears once. Persistence metadata and duplicate day/Inbox
// copies consumed the fallback model's input budget on ordinary accounts.
func operationContext(w *Workflow, owned []generated.Task, categories []generated.Category, today string, referenced *uuid.UUID) []byte {
	type task struct {
		ID          uuid.UUID              `json:"id"`
		Title       string                 `json:"title"`
		Description *string                `json:"description,omitempty"`
		Duration    *int32                 `json:"duration,omitempty"`
		CategoryID  *uuid.UUID             `json:"categoryId,omitempty"`
		Urgency     generated.UrgencyLevel `json:"urgency"`
		Date        string                 `json:"plannedForDate"`
		Status      generated.TaskStatus   `json:"status"`
		Completed   bool                   `json:"completed,omitempty"`
		DueDate     string                 `json:"dueDate,omitempty"`
	}
	tasks := make([]task, 0, len(owned))
	for _, t := range owned {
		if t.Status == generated.TaskStatusDropped {
			continue
		}
		item := task{ID: t.ID, Title: t.Title, Description: t.Description, Duration: t.Duration, CategoryID: t.CategoryID, Urgency: t.Urgency, Date: t.PlannedForDate.Time.Format("2006-01-02"), Status: t.Status, Completed: t.Completed}
		if t.DueDate.Valid {
			item.DueDate = t.DueDate.Time.Format("2006-01-02")
		}
		tasks = append(tasks, item)
	}
	type category struct {
		ID   uuid.UUID `json:"id"`
		Name string    `json:"name"`
	}
	cats := make([]category, 0, len(categories))
	for _, c := range categories {
		cats = append(cats, category{c.ID, c.Name})
	}
	raw, _ := json.Marshal(map[string]any{"date": w.Date, "localToday": today, "operationsEnabled": true, "referencedTaskId": referenced, "state": w.State, "ownedTasks": tasks, "categories": cats, "availableMinutes": w.AvailableMinutes, "proposal": w.Proposal})
	return raw
}
