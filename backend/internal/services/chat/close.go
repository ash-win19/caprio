package chat

import (
	"context"
	"encoding/json"
	"fmt"
	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type TaskAction struct {
	TaskID uuid.UUID `json:"taskId"`
	Action string    `json:"action"`
}
type CloseRequest struct {
	Date        string       `json:"date"`
	EnergyLevel *int32       `json:"energyLevel"`
	Notes       *string      `json:"notes"`
	TaskActions []TaskAction `json:"taskActions"`
}
type CloseResult struct {
	Session generated.StandupSession `json:"session"`
	Review
	NextDate string    `json:"nextDate"`
	Workflow *Workflow `json:"workflow"`
}

func validateClose(req CloseRequest, tasks []generated.Task) error {
	if req.TaskActions == nil {
		return invalid("taskActions is required")
	}
	if req.EnergyLevel != nil && (*req.EnergyLevel < 1 || *req.EnergyLevel > 5) {
		return invalid("energyLevel must be between 1 and 5")
	}
	if req.Notes != nil && len(*req.Notes) > 12000 {
		return invalid("notes must contain at most 12000 characters")
	}
	candidates := map[uuid.UUID]generated.Task{}
	for _, task := range tasks {
		candidates[task.ID] = task
	}
	seen := map[uuid.UUID]bool{}
	for _, a := range req.TaskActions {
		if a.Action != "done" && a.Action != "tomorrow" && a.Action != "drop" {
			return invalid("invalid action %q", a.Action)
		}
		task, ok := candidates[a.TaskID]
		if !ok {
			return invalid("task %s not found for date", a.TaskID)
		}
		if seen[a.TaskID] {
			return invalid("duplicate task action")
		}
		if (task.Completed || task.Status == generated.TaskStatusCompleted) && a.Action != "done" {
			return invalid("completed tasks must keep the done outcome")
		}
		seen[a.TaskID] = true
	}
	if len(seen) != len(candidates) {
		return invalid("choose an outcome for every task before closing the day")
	}
	return nil
}

func (s *Service) Close(ctx context.Context, userID uuid.UUID, req CloseRequest) (*CloseResult, error) {
	return s.close(ctx, userID, req, nil)
}

// A destination makes this an automatic rollover. Outcomes are derived from
// the saved checkboxes under the same account lock as task edits.
func (s *Service) close(ctx context.Context, userID uuid.UUID, req CloseRequest, destination *pgtype.Date) (*CloseResult, error) {
	date, err := ParseDate(req.Date)
	if err != nil {
		return nil, err
	}
	nextDate := pgtype.Date{Time: date.Time.AddDate(0, 0, 1), Valid: true}
	if destination != nil {
		nextDate = *destination
		if !nextDate.Time.After(date.Time) {
			return nil, invalid("carry destination must follow the original day")
		}
	}
	result := &CloseResult{NextDate: nextDate.Time.Format("2006-01-02")}
	changed := false
	err = s.store.WithUserTx(ctx, userID, func(tx pgx.Tx, q *generated.Queries) error {
		if err := ensureDay(ctx, tx, userID, date); err != nil {
			return err
		}
		w, err := load(ctx, tx, userID, date)
		if err != nil {
			return err
		}
		if w.State == "closed" {
			result.Workflow = w
			if w.Review != nil {
				result.Review = *w.Review
				if w.Review.CarriedToDate != "" {
					result.NextDate = w.Review.CarriedToDate
				}
			}
			result.Session, err = q.GetStandupByUserAndDate(ctx, generated.GetStandupByUserAndDateParams{UserID: userID, SessionDate: date})
			return err
		}
		if destination != nil {
			result.Automatic = true
			req.TaskActions = make([]TaskAction, 0, len(w.Tasks))
			for _, task := range w.Tasks {
				action := "tomorrow"
				if task.Completed || task.Status == generated.TaskStatusCompleted {
					action = "done"
				}
				req.TaskActions = append(req.TaskActions, TaskAction{TaskID: task.ID, Action: action})
			}
		}
		if err := validateClose(req, w.Tasks); err != nil {
			return err
		}
		actions := map[uuid.UUID]string{}
		for _, a := range req.TaskActions {
			actions[a.TaskID] = a.Action
			switch a.Action {
			case "done":
				// Preserve when the user actually checked off completed work.
				_, err = tx.Exec(ctx, `UPDATE tasks SET completed=true,status='completed',completed_at=COALESCE(completed_at,clock_timestamp()),updated_at=clock_timestamp() WHERE id=$1 AND user_id=$2`, a.TaskID, userID)
				result.CompletedCount++
			case "tomorrow":
				// Do not silently add carryovers to an already closed next day.
				var closed bool
				err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM daily_plans WHERE user_id=$1 AND plan_date=$2 AND state='closed')`, userID, nextDate).Scan(&closed)
				if err == nil && closed {
					return invalid("tomorrow is already closed")
				}
				if err == nil {
					_, err = tx.Exec(ctx, `INSERT INTO task_carryovers(task_id,first_planned_date) SELECT id,planned_for_date FROM tasks WHERE id=$1 AND user_id=$2 ON CONFLICT DO NOTHING`, a.TaskID, userID)
				}
				if err == nil {
					err = q.CloseTaskTomorrow(ctx, generated.CloseTaskTomorrowParams{ID: a.TaskID, UserID: userID, PlannedForDate: nextDate})
				}
				result.CarriedToTomorrowCount++
			case "drop":
				err = q.CloseTaskDrop(ctx, generated.CloseTaskDropParams{ID: a.TaskID, UserID: userID})
				result.DroppedCount++
			}
			if err != nil {
				return err
			}
		}
		result.EnergyLevel = req.EnergyLevel
		if req.Notes != nil {
			result.Notes = *req.Notes
		}
		if result.CarriedToTomorrowCount > 0 {
			result.CarriedToDate = result.NextDate
			// New arrivals invalidate the destination draft, but do not confirm it.
			if _, err := tx.Exec(ctx, `UPDATE daily_plans SET proposal=NULL,proposal_snapshot=NULL,version=version+1,updated_at=clock_timestamp() WHERE user_id=$1 AND plan_date=$2`, userID, nextDate); err != nil {
				return err
			}
		}
		// Preserve the original day's task records for history, even after a
		// carried task is completed or edited on a later day.
		for i := range w.Tasks {
			switch actions[w.Tasks[i].ID] {
			case "done":
				w.Tasks[i].Completed = true
				w.Tasks[i].Status = generated.TaskStatusCompleted
			case "tomorrow":
				w.Tasks[i].PlannedForDate = nextDate
				w.Tasks[i].Source = generated.TaskSourceCarried
				w.Tasks[i].CarriedOver = true
				w.Tasks[i].DeferCount++
			case "drop":
				w.Tasks[i].Status = generated.TaskStatusDropped
			}
		}
		// Every close has an immutable review, even when today was reopened.
		review, _ := json.Marshal(result.Review)
		archived, _ := json.Marshal(w.Tasks)
		if _, err := tx.Exec(ctx, `INSERT INTO day_reviews(user_id,plan_date,review,closed_tasks) VALUES($1,$2,$3,$4)`, userID, date, review, archived); err != nil {
			return err
		}
		// The day summary is a union by identity, not a sum of review counters.
		// Earlier carried tasks stay in history after new work arrives later.
		combined := []generated.Task{}
		positions := map[uuid.UUID]int{}
		put := func(task generated.Task) {
			if index, ok := positions[task.ID]; ok {
				combined[index] = task
			} else {
				positions[task.ID] = len(combined)
				combined = append(combined, task)
			}
		}
		for _, entry := range w.ReviewHistory {
			for _, task := range entry.Tasks {
				put(task)
			}
		}
		for _, task := range w.Tasks {
			put(task)
		}
		result.CompletedCount = 0
		result.CarriedToTomorrowCount = 0
		result.DroppedCount = 0
		for _, task := range combined {
			switch {
			case task.Completed || task.Status == generated.TaskStatusCompleted:
				result.CompletedCount++
			case task.Status == generated.TaskStatusDropped:
				result.DroppedCount++
			case task.Status == generated.TaskStatusPlanned:
				result.CarriedToTomorrowCount++
			}
		}
		if result.CarriedToTomorrowCount > 0 {
			result.CarriedToDate = result.NextDate
		}
		review, _ = json.Marshal(result.Review)
		archived, _ = json.Marshal(combined)
		var sessionID uuid.UUID
		if err := tx.QueryRow(ctx, `INSERT INTO standup_sessions(user_id,session_date,energy_level,notes,tasks_planned,tasks_completed) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,session_date) DO UPDATE SET energy_level=EXCLUDED.energy_level,notes=EXCLUDED.notes,tasks_planned=EXCLUDED.tasks_planned,tasks_completed=EXCLUDED.tasks_completed RETURNING id`, userID, date, req.EnergyLevel, req.Notes, len(combined), result.CompletedCount).Scan(&sessionID); err != nil {
			return err
		}
		result.Session, err = q.GetStandupByUserAndDate(ctx, generated.GetStandupByUserAndDateParams{UserID: userID, SessionDate: date})
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE daily_plans SET state='closed',proposal=NULL,proposal_snapshot=NULL,review=$3,closed_tasks=$4,version=version+1,updated_at=clock_timestamp() WHERE user_id=$1 AND plan_date=$2`, userID, date, review, archived); err != nil {
			return fmt.Errorf("save review: %w", err)
		}
		result.Workflow, err = load(ctx, tx, userID, date)
		changed = err == nil
		return err
	})
	if err == nil && changed {
		logWorkflowEvent(ctx, "day_closed", userID, result.Workflow, len(result.Workflow.Tasks),
			"review_id", result.Session.ID.String(), "completed_count", result.CompletedCount,
			"carried_count", result.CarriedToTomorrowCount, "dropped_count", result.DroppedCount)
		if result.CarriedToTomorrowCount > 0 {
			logWorkflowEvent(ctx, "tasks_carried", userID, result.Workflow, int(result.CarriedToTomorrowCount),
				"review_id", result.Session.ID.String(), "destination_date", result.NextDate)
		}
	}
	return result, err
}
