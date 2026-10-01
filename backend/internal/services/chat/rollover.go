package chat

import (
	"context"
	"time"
	_ "time/tzdata"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// LocalToday derives the rollover destination from the clock, never a browsed
// calendar date. This prevents opening tomorrow from moving today's work early.
func LocalToday(now time.Time, timezone string) (pgtype.Date, error) {
	if timezone == "" {
		return pgtype.Date{}, invalid("timezone is required")
	}
	location, err := time.LoadLocation(timezone)
	if err != nil {
		return pgtype.Date{}, invalid("invalid timezone")
	}
	return ParseDate(now.In(location).Format("2006-01-02"))
}

// Rollover catches up missed days without creating phantom plans for dates the
// user never opened. Each source day is archived and moved in one transaction.
// A retry or another tab can safely resume after any already-completed day.
func (s *Service) Rollover(ctx context.Context, userID uuid.UUID, today pgtype.Date) (*Workflow, error) {
	ctx = withClock(ctx, s.now)
	current, err := s.Get(ctx, userID, today)
	if err != nil || current.State == "closed" {
		return current, err
	}
	rows, err := s.store.Pool.Query(ctx, `
		WITH candidates AS (
			SELECT plan_date AS day FROM daily_plans WHERE user_id=$1 AND plan_date<$2 AND state='active'
			UNION
			SELECT planned_for_date FROM tasks WHERE user_id=$1 AND planned_for_date<$2 AND status IN ('planned','completed')
		)
		SELECT c.day::text FROM candidates c LEFT JOIN daily_plans p ON p.user_id=$1 AND p.plan_date=c.day
		WHERE p.state IS DISTINCT FROM 'closed' ORDER BY c.day`, userID, today)
	if err != nil {
		return nil, err
	}
	var dates []string
	for rows.Next() {
		var date string
		if err := rows.Scan(&date); err != nil {
			rows.Close()
			return nil, err
		}
		dates = append(dates, date)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, date := range dates {
		if _, err := s.close(ctx, userID, CloseRequest{Date: date}, &today); err != nil {
			return nil, err
		}
	}
	return s.Get(ctx, userID, today)
}
