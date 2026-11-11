package chat

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"unicode"

	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// TaskOperation changes only the fields the user named. Absent and null fields
// remain distinct, including when clearing an optional estimate or category.
type TaskOperation struct {
	Kind          string                     `json:"kind"`
	TaskID        *uuid.UUID                 `json:"taskId,omitempty"`
	Date          string                     `json:"date,omitempty"`
	Inbox         bool                       `json:"inbox,omitempty"`
	Fields        map[string]json.RawMessage `json:"fields,omitempty"`
	NewOccurrence bool                       `json:"newOccurrence,omitempty"`
	Completed     *bool                      `json:"completed,omitempty"`
}
type TaskChange struct {
	Before *generated.Task `json:"before"`
	After  generated.Task  `json:"after"`
	Action string          `json:"action"`
}
type dayState struct {
	State        string `json:"state"`
	AfterVersion int32  `json:"afterVersion"`
}
type changeBatch struct {
	ID        uuid.UUID
	RequestID uuid.UUID
	Date      pgtype.Date
	Changes   []TaskChange
	Days      map[string]dayState
}

func titleKey(s string) string {
	return strings.Join(strings.FieldsFunc(strings.ToLower(s), func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) }), " ")
}

func patchTask(t *generated.Task, fields map[string]json.RawMessage) error {
	for key, raw := range fields {
		if (key == "title" || key == "urgency") && string(raw) == "null" {
			return invalid("%s cannot be cleared", key)
		}
		var err error
		// Pointer fields decode into fresh values: the task may share them with
		// the saved copy it is compared against.
		switch key {
		case "title":
			err = json.Unmarshal(raw, &t.Title)
			t.Title = strings.TrimSpace(t.Title)
		case "description":
			t.Description = nil
			err = json.Unmarshal(raw, &t.Description)
		case "categoryId":
			t.CategoryID = nil
			err = json.Unmarshal(raw, &t.CategoryID)
		case "urgency":
			err = json.Unmarshal(raw, &t.Urgency)
		case "duration":
			t.Duration = nil
			err = json.Unmarshal(raw, &t.Duration)
		case "dueDate":
			err = json.Unmarshal(raw, &t.DueDate)
		default:
			return invalid("unknown task field")
		}
		if err != nil {
			return invalid("invalid %s", key)
		}
	}
	if t.Title == "" || len(t.Title) > 500 || (t.Duration != nil && (*t.Duration < 1 || *t.Duration > 1440)) || !t.Urgency.Valid() {
		return invalid("invalid task details")
	}
	if t.Description != nil && len(*t.Description) > 12000 {
		return invalid("task notes are too long")
	}
	return nil
}

func writeTask(ctx context.Context, tx pgx.Tx, t generated.Task) error {
	_, err := tx.Exec(ctx, `UPDATE tasks SET title=$3,description=$4,category_id=$5,urgency=$6,duration=$7,source=$8,completed=$9,added_today=$10,carried_over=$11,sort_order=$12,due_date=$13,defer_count=$14,planned_for_date=$15,status=$16,priority_reason=$17,completed_at=$18,updated_at=clock_timestamp() WHERE id=$1 AND user_id=$2`, t.ID, t.UserID, t.Title, t.Description, t.CategoryID, t.Urgency, t.Duration, t.Source, t.Completed, t.AddedToday, t.CarriedOver, t.SortOrder, t.DueDate, t.DeferCount, t.PlannedForDate, t.Status, t.PriorityReason, t.CompletedAt)
	return err
}

// applyOperations runs inside the same account transaction as the saved turn.
// It never replaces an entire plan or restores rows from a review archive.
func applyOperations(ctx context.Context, tx pgx.Tx, user uuid.UUID, date pgtype.Date, requestID uuid.UUID, ops []TaskOperation) (*changeBatch, error) {
	q := generated.New(tx)
	batch := &changeBatch{ID: uuid.New(), RequestID: requestID, Date: date, Days: map[string]dayState{}}
	seen := map[uuid.UUID]bool{}
	rememberDay := func(day pgtype.Date, arrival bool) error {
		if err := WritableDate(ctx, day); err != nil {
			return err
		}
		key := day.Time.Format("2006-01-02")
		if _, ok := batch.Days[key]; ok {
			return nil
		}
		if err := ensureDay(ctx, tx, user, day); err != nil {
			return err
		}
		var state string
		if err := tx.QueryRow(ctx, `SELECT state FROM daily_plans WHERE user_id=$1 AND plan_date=$2`, user, day).Scan(&state); err != nil {
			return err
		}
		if state == "closed" && (!arrival || !day.Time.Equal(CurrentDate(ctx).Time)) {
			return ErrClosed
		}
		batch.Days[key] = dayState{State: state}
		return nil
	}
	for _, original := range ops {
		op := original
		var before *generated.Task
		var task generated.Task
		destination := date
		if op.Date != "" {
			var err error
			destination, err = ParseDate(op.Date)
			if err != nil {
				return nil, err
			}
		}
		if op.Kind == "create" {
			task = generated.Task{UserID: user, Urgency: generated.UrgencyLevelMedium, Source: generated.TaskSourceStandup, Status: generated.TaskStatusPlanned, PlannedForDate: destination, AddedToday: true}
			if err := patchTask(&task, op.Fields); err != nil {
				return nil, err
			}
			// Exact normalized matches are a deterministic backstop for model ID reuse.
			if !op.NewOccurrence {
				all, err := q.ListTasksByUser(ctx, user)
				if err != nil {
					return nil, err
				}
				matches := []generated.Task{}
				for _, candidate := range all {
					if candidate.Status != generated.TaskStatusDropped && titleKey(candidate.Title) == titleKey(task.Title) {
						matches = append(matches, candidate)
					}
				}
				if len(matches) > 1 {
					return nil, invalidCode("ambiguous_task", "More than one saved task matches. Specify which task you mean.")
				}
				if len(matches) == 1 {
					match := matches[0]
					if match.Completed {
						return nil, invalidCode("ambiguous_task", "That task is already completed. Say whether you want another occurrence.")
					}
					op.TaskID = &match.ID
					op.Kind = "move"
					fields := map[string]json.RawMessage{}
					if task.Description != nil && strings.TrimSpace(*task.Description) != "" && (match.Description == nil || !strings.Contains(*match.Description, *task.Description)) {
						notes := *task.Description
						if match.Description != nil {
							notes = *match.Description + "\n" + notes
						}
						fields["description"], _ = json.Marshal(notes)
					}
					op.Fields = fields
				}
			}
		}
		if op.TaskID != nil {
			current, err := q.GetTaskByID(ctx, generated.GetTaskByIDParams{ID: *op.TaskID, UserID: user})
			if err != nil {
				return nil, err
			}
			if current.Status == generated.TaskStatusDropped {
				return nil, invalid("removed tasks cannot be changed")
			}
			if seen[current.ID] {
				return nil, invalid("a task can only be changed once per turn")
			}
			before = &current
			task = current
			if current.Status != generated.TaskStatusBacklog {
				if err := rememberDay(current.PlannedForDate, false); err != nil {
					return nil, err
				}
			}
			if err := patchTask(&task, op.Fields); err != nil {
				return nil, err
			}
		}
		if task.CategoryID != nil {
			var owned bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM categories WHERE id=$1 AND user_id=$2)`, task.CategoryID, user).Scan(&owned); err != nil {
				return nil, err
			}
			if !owned {
				return nil, invalid("category does not belong to this account")
			}
		}
		action := "Updated"
		switch op.Kind {
		case "create", "move":
			if task.Completed {
				return nil, invalid("completed tasks stay on their original day")
			}
			if !op.Inbox {
				if err := rememberDay(destination, true); err != nil {
					return nil, err
				}
			}
			arrival := before == nil || before.Status == generated.TaskStatusBacklog || !before.PlannedForDate.Time.Equal(destination.Time)
			task.PlannedForDate = destination
			task.Status = generated.TaskStatusPlanned
			if op.Inbox {
				task.Status = generated.TaskStatusBacklog
			}
			if arrival {
				if err := tx.QueryRow(ctx, `SELECT COALESCE(max(sort_order),-1)+1 FROM tasks WHERE user_id=$1 AND planned_for_date=$2`, user, destination).Scan(&task.SortOrder); err != nil {
					return nil, err
				}
				action = "Moved"
				if before == nil {
					action = "Added"
				} else if before.Status == generated.TaskStatusBacklog {
					action = "Moved from Later"
				}
			}
			// A task the person re-plans for another day or Later starts fresh
			// there: it is no longer a Carried task.
			if before != nil && carried(*before) && (arrival || op.Inbox) {
				task.DeferCount, task.CarriedOver = 0, false
				if _, err := tx.Exec(ctx, `DELETE FROM task_carryovers WHERE task_id=$1`, task.ID); err != nil {
					return nil, err
				}
			}
		case "complete":
			task.Completed = *op.Completed
			task.Status = generated.TaskStatusPlanned
			task.CompletedAt = pgtype.Timestamptz{}
			action = "Marked unfinished"
			if task.Completed {
				task.Status = generated.TaskStatusCompleted
				action = "Completed"
				if before != nil && before.CompletedAt.Valid {
					task.CompletedAt = before.CompletedAt
				} else {
					if err := tx.QueryRow(ctx, `SELECT clock_timestamp()`).Scan(&task.CompletedAt); err != nil {
						return nil, err
					}
				}
			}
		case "remove":
			// A Later task has no Day of its own; it is dropped on today.
			if task.Status == generated.TaskStatusBacklog {
				task.PlannedForDate = CurrentDate(ctx)
			}
			task.Status = generated.TaskStatusDropped
			action = "Removed"
		}
		if before != nil && reflect.DeepEqual(*before, task) {
			continue
		}
		if before == nil {
			saved, err := q.CreateTask(ctx, generated.CreateTaskParams{UserID: user, Title: task.Title, Description: task.Description, CategoryID: task.CategoryID, Urgency: task.Urgency, Duration: task.Duration, Source: task.Source, DueDate: task.DueDate, SortOrder: task.SortOrder, PlannedForDate: task.PlannedForDate, Status: task.Status, PriorityReason: task.PriorityReason})
			if err != nil {
				return nil, err
			}
			task = saved
		} else {
			if err := writeTask(ctx, tx, task); err != nil {
				return nil, err
			}
			var err error
			task, err = q.GetTaskByID(ctx, generated.GetTaskByIDParams{ID: task.ID, UserID: user})
			if err != nil {
				return nil, err
			}
		}
		seen[task.ID] = true
		batch.Changes = append(batch.Changes, TaskChange{Before: before, After: task, Action: action})
	}
	if len(batch.Changes) == 0 {
		return nil, nil
	}
	// Inbox changes can invalidate a suggestion on any day. Versions advance for
	// touched days; unrelated days advance only when their suggestion is cleared.
	if _, err := tx.Exec(ctx, `UPDATE daily_plans SET proposal=NULL,proposal_snapshot=NULL,draft=NULL,version=version+1,updated_at=clock_timestamp() WHERE user_id=$1 AND (proposal IS NOT NULL OR draft IS NOT NULL)`, user); err != nil {
		return nil, err
	}
	for day, prior := range batch.Days {
		var version int32
		if err := tx.QueryRow(ctx, `UPDATE daily_plans SET state='active',proposal=NULL,proposal_snapshot=NULL,draft=NULL,version=version+1,updated_at=clock_timestamp() WHERE user_id=$1 AND plan_date=$2 RETURNING version`, user, day).Scan(&version); err != nil {
			return nil, err
		}
		prior.AfterVersion = version
		batch.Days[day] = prior
	}
	changes, _ := json.Marshal(batch.Changes)
	days, _ := json.Marshal(batch.Days)
	_, err := tx.Exec(ctx, `INSERT INTO task_change_batches(id,user_id,request_id,conversation_date,changes,day_states) VALUES($1,$2,$3,$4,$5,$6)`, batch.ID, user, requestID, date, changes, days)
	return batch, err
}
