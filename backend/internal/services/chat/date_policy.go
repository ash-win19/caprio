package chat

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

type timezoneKey struct{}

// WithTimezone validates a browser timezone. The server clock determines today.
func WithTimezone(ctx context.Context, timezone string) (context.Context, error) {
	if timezone == "" {
		timezone = "UTC"
	}
	if _, err := LocalToday(time.Now(), timezone); err != nil {
		return ctx, err
	}
	return context.WithValue(ctx, timezoneKey{}, timezone), nil
}

func CurrentDate(ctx context.Context) pgtype.Date {
	date, _ := ParseDate(LocalNow(ctx).Format("2006-01-02"))
	return date
}

// LocalNow is the current wall-clock time in the request's timezone.
// WithTimezone has already validated the zone.
func LocalNow(ctx context.Context) time.Time {
	timezone, _ := ctx.Value(timezoneKey{}).(string)
	location, err := time.LoadLocation(timezone)
	if timezone == "" || err != nil {
		location = time.UTC
	}
	return time.Now().In(location)
}

func WritableDate(ctx context.Context, date pgtype.Date) error {
	if !date.Valid || date.Time.Before(CurrentDate(ctx).Time) {
		return invalidCode("historical_day", "Past days are read-only. Choose today or a future day.")
	}
	return nil
}
