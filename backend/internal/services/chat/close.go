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
	date, err := ParseDate(req.Date)
	if err != nil {
		return nil, err
	}
	nextDate := pgtype.Date{Time: date.Time.AddDate(0, 0, 1), Valid: true}
	result := &CloseResult{NextDate: nextDate.Time.Format("2006-01-02")}
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
			}
			result.Session, err = q.GetStandupByUserAndDate(ctx, generated.GetStandupByUserAndDateParams{UserID: userID, SessionDate: date})
			return err
		}
		if err := validateClose(req, w.Tasks); err != nil {
			return err
		}
		actions := map[uuid.UUID]string{}
		for _, a := range req.TaskActions {
			actions[a.TaskID] = a.Action
			switch a.Action {
			case "done":
				err = q.CloseTaskDone(ctx, generated.CloseTaskDoneParams{ID: a.TaskID, UserID: userID})
				result.CompletedCount++
			case "tomorrow":
				// Do not silently add carryovers to an already closed next day.
				var closed bool
				err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM daily_plans WHERE user_id=$1 AND plan_date=$2 AND state='closed')`, userID, nextDate).Scan(&closed)
				if err == nil && closed {
					return invalid("tomorrow is already closed")
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
		session, err := q.CreateStandupSession(ctx, generated.CreateStandupSessionParams{UserID: userID, SessionDate: date, EnergyLevel: req.EnergyLevel, Notes: req.Notes, TasksPlanned: int32(len(w.Tasks))})
		if err != nil {
			return err
		}
		result.Session, err = q.UpdateStandupSession(ctx, generated.UpdateStandupSessionParams{ID: session.ID, TasksCompleted: &result.CompletedCount})
		if err != nil {
			return err
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
		review, _ := json.Marshal(result.Review)
		archived, _ := json.Marshal(w.Tasks)
		if _, err := tx.Exec(ctx, `UPDATE daily_plans SET state='closed',proposal=NULL,proposal_snapshot=NULL,review=$3,closed_tasks=$4,version=version+1,updated_at=clock_timestamp() WHERE user_id=$1 AND plan_date=$2`, userID, date, review, archived); err != nil {
			return fmt.Errorf("save review: %w", err)
		}
		result.Workflow, err = load(ctx, tx, userID, date)
		return err
	})
	return result, err
}
