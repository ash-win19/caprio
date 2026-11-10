package chat

import (
	"context"
	"encoding/json"

	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// historyLimit is how many past Days History lists; older ones are left out.
const historyLimit = 90

// HistoryDay is what happened to one past Day's tasks, by name. The names are
// the ones saved when the Day ended, so they stay as they were on that Day.
type HistoryDay struct {
	Date string `json:"date"`
	// WrappedUp is true once the person wrapped the Day up, even if they went
	// on to continue it and Rollover ended it the last time.
	WrappedUp bool   `json:"wrappedUp"`
	Note      string `json:"note"`
	// Days that ended before task names were kept have only the counts.
	TaskDetailsAvailable bool     `json:"taskDetailsAvailable"`
	Done                 []string `json:"done"`
	Carried              []string `json:"carried"`
	Dropped              []string `json:"dropped"`
	DoneCount            int32    `json:"doneCount"`
	CarriedCount         int32    `json:"carriedCount"`
	DroppedCount         int32    `json:"droppedCount"`
}

// History lists the Days before the given one, newest first: every Day that
// ended, and every Day that only had a Conversation.
func (s *Service) History(ctx context.Context, userID uuid.UUID, before pgtype.Date) ([]HistoryDay, error) {
	rows, err := s.store.Pool.Query(ctx, `
		WITH days AS (
			SELECT plan_date AS day FROM daily_plans WHERE user_id=$1 AND state='closed' AND plan_date<$2
			UNION
			SELECT session_date FROM chat_messages WHERE user_id=$1 AND session_date<$2 AND role<>'event'
		)
		SELECT d.day::text,COALESCE(p.state,''),p.review,p.closed_tasks FROM days d
		LEFT JOIN daily_plans p ON p.user_id=$1 AND p.plan_date=d.day
		ORDER BY d.day DESC LIMIT $3`, userID, before, historyLimit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	days := []HistoryDay{}
	for rows.Next() {
		day := HistoryDay{TaskDetailsAvailable: true, Done: []string{}, Carried: []string{}, Dropped: []string{}}
		var state string
		var rawReview, rawTasks []byte
		if err := rows.Scan(&day.Date, &state, &rawReview, &rawTasks); err != nil {
			return nil, err
		}
		if state == "closed" {
			var review Review
			if len(rawReview) > 0 {
				if err := json.Unmarshal(rawReview, &review); err != nil {
					return nil, err
				}
			}
			day.WrappedUp, day.Note = !review.Automatic, review.Notes
			day.DoneCount, day.CarriedCount, day.DroppedCount = review.CompletedCount, review.CarriedToTomorrowCount, review.DroppedCount
			day.TaskDetailsAvailable = len(rawTasks) > 0 && string(rawTasks) != "null"
			if day.TaskDetailsAvailable {
				var tasks []generated.Task
				if err := json.Unmarshal(rawTasks, &tasks); err != nil {
					return nil, err
				}
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
		}
		days = append(days, day)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	wrapUps, err := s.wrapUps(ctx, userID, before)
	if err != nil {
		return nil, err
	}
	for i := range days {
		if wrapUp, ok := wrapUps[days[i].Date]; ok {
			days[i].WrappedUp, days[i].Note = true, wrapUp
		}
	}
	return days, nil
}

// wrapUps maps each Day the person wrapped up to its latest note. A Day that
// is continued after Wrap up ends a second time through Rollover, which
// records no note; the person's own Wrap up still stands.
func (s *Service) wrapUps(ctx context.Context, userID uuid.UUID, before pgtype.Date) (map[string]string, error) {
	rows, err := s.store.Pool.Query(ctx, `SELECT plan_date::text,review FROM day_reviews WHERE user_id=$1 AND plan_date<$2 ORDER BY created_at,id`, userID, before)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	notes := map[string]string{}
	for rows.Next() {
		var date string
		var raw []byte
		if err := rows.Scan(&date, &raw); err != nil {
			return nil, err
		}
		var review Review
		if err := json.Unmarshal(raw, &review); err != nil {
			return nil, err
		}
		if !review.Automatic {
			notes[date] = review.Notes
		}
	}
	return notes, rows.Err()
}
