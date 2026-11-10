package chat

import (
	"context"
	"encoding/json"

	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// historyDays caps one History page; older Days are not listed yet.
const historyDays = 90

// HistoryDay is what happened to one past Day's tasks, by name. The names come
// from the Day's archive, so they stay as they were on that Day.
type HistoryDay struct {
	Date      string `json:"date"`
	WrappedUp bool   `json:"wrappedUp"` // false when Rollover carried the Day forward on its own
	Note      string `json:"note"`
	// Days archived before task names were kept have only the counts.
	TaskNamesAvailable bool     `json:"taskNamesAvailable"`
	Done               []string `json:"done"`
	Carried            []string `json:"carried"`
	Dropped            []string `json:"dropped"`
	DoneCount          int32    `json:"doneCount"`
	CarriedCount       int32    `json:"carriedCount"`
	DroppedCount       int32    `json:"droppedCount"`
}

// History lists the Days before the given one that have ended, newest first.
func (s *Service) History(ctx context.Context, userID uuid.UUID, before pgtype.Date) ([]HistoryDay, error) {
	rows, err := s.store.Pool.Query(ctx, `SELECT plan_date::text,review,closed_tasks FROM daily_plans WHERE user_id=$1 AND state='closed' AND plan_date<$2 ORDER BY plan_date DESC LIMIT $3`, userID, before, historyDays)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	days := []HistoryDay{}
	for rows.Next() {
		day := HistoryDay{Done: []string{}, Carried: []string{}, Dropped: []string{}}
		var rawReview, rawTasks []byte
		if err := rows.Scan(&day.Date, &rawReview, &rawTasks); err != nil {
			return nil, err
		}
		var review Review
		if len(rawReview) > 0 {
			if err := json.Unmarshal(rawReview, &review); err != nil {
				return nil, err
			}
		}
		day.WrappedUp, day.Note = !review.Automatic, review.Notes
		day.DoneCount, day.CarriedCount, day.DroppedCount = review.CompletedCount, review.CarriedToTomorrowCount, review.DroppedCount
		if len(rawTasks) > 0 && string(rawTasks) != "null" {
			var tasks []generated.Task
			if err := json.Unmarshal(rawTasks, &tasks); err != nil {
				return nil, err
			}
			day.TaskNamesAvailable = true
			for _, task := range tasks {
				switch {
				case task.Completed || task.Status == generated.TaskStatusCompleted:
					day.Done = append(day.Done, task.Title)
				case task.Status == generated.TaskStatusDropped:
					day.Dropped = append(day.Dropped, task.Title)
				case task.Status == generated.TaskStatusPlanned:
					day.Carried = append(day.Carried, task.Title)
				}
			}
		}
		days = append(days, day)
	}
	return days, rows.Err()
}
