package chat

import (
	"encoding/json"
	"strings"
	"testing"

	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/google/uuid"
)

func TestOperationContextPreservesIdentityAndDetailsWithoutDatabaseMetadata(t *testing.T) {
	date, _ := ParseDate("2026-09-16")
	due, _ := ParseDate("2026-09-17")
	notes := "Preserve the brand and use Cozad's feedback."
	duration := int32(120)
	user := uuid.New()
	category := uuid.New()
	tasks := []generated.Task{
		{ID: uuid.New(), UserID: user, Title: "Fix Headlines", Description: &notes, Duration: &duration, CategoryID: &category, Urgency: generated.UrgencyLevelMedium, PlannedForDate: date, DueDate: due, Status: generated.TaskStatusBacklog},
		{ID: uuid.New(), UserID: user, Title: "Completed task", Completed: true, Status: generated.TaskStatusCompleted, PlannedForDate: date},
		{ID: uuid.New(), UserID: user, Title: "Removed task", Status: generated.TaskStatusDropped, PlannedForDate: date},
	}
	raw := operationContext(&Workflow{Date: "2026-09-16", State: "active", Tasks: tasks, Backlog: tasks}, tasks, []generated.Category{{ID: category, Name: "Slides"}}, "2026-09-16", &tasks[0].ID)
	var context map[string]json.RawMessage
	if err := json.Unmarshal(raw, &context); err != nil {
		t.Fatal(err)
	}
	var got []map[string]any
	if err := json.Unmarshal(context["ownedTasks"], &got); err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0]["id"] != tasks[0].ID.String() || got[1]["completed"] != true || got[0]["description"] != notes || got[0]["duration"] != float64(120) || got[0]["dueDate"] != "2026-09-17" || got[0]["categoryId"] != category.String() {
		t.Fatalf("task details lost: %s", raw)
	}
	for _, key := range []string{"tasks", "backlog"} {
		if _, exists := context[key]; exists {
			t.Errorf("duplicated task list %s", key)
		}
	}
	for _, key := range []string{"userId", "createdAt", "updatedAt", "sortOrder", "completedAt"} {
		if strings.Contains(string(raw), `"`+key+`"`) {
			t.Errorf("unnecessary metadata %s", key)
		}
	}
	if strings.Contains(string(raw), tasks[2].ID.String()) {
		t.Fatal("removed task exposed as an identity candidate")
	}
}
