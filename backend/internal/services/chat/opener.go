package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/ashwinshanmugam/caprio/backend/internal/mastra"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// openerText is the app-written first message of a day's conversation. It costs
// no model call. now is the user's local wall-clock time; past days get none.
func openerText(date pgtype.Date, now time.Time, tasks []generated.Task, origins map[string]string) *string {
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	day := time.Date(date.Time.Year(), date.Time.Month(), date.Time.Day(), 0, 0, 0, 0, time.UTC)
	var text string
	switch {
	case day.Before(today):
		return nil
	case day.After(today):
		text = fmt.Sprintf("Planning %s. What's on?", day.Format("Monday, Jan 2"))
	default:
		greeting := "Morning"
		if now.Hour() >= 17 {
			greeting = "Evening"
		} else if now.Hour() >= 12 {
			greeting = "Afternoon"
		}
		yesterday := day.AddDate(0, 0, -1).Format("2006-01-02")
		carried, fromYesterday := 0, 0
		for _, t := range tasks {
			if t.Completed || t.Status != generated.TaskStatusPlanned || t.DeferCount == 0 {
				continue
			}
			carried++
			if origins[t.ID.String()] == yesterday {
				fromYesterday++
			}
		}
		switch {
		case carried == 0:
			text = greeting + ". What's on today?"
		case fromYesterday == carried:
			text = fmt.Sprintf("%s. %s carried over from yesterday. What's on today?", greeting, plural(carried, "task"))
		case fromYesterday == 0:
			text = fmt.Sprintf("%s. %s carried over. What's on today?", greeting, plural(carried, "task"))
		default:
			text = fmt.Sprintf("%s. %s carried over, %d from yesterday. What's on today?", greeting, plural(carried, "task"), fromYesterday)
		}
	}
	return &text
}

func plural(n int, noun string) string {
	if n == 1 {
		return fmt.Sprintf("1 %s", noun)
	}
	return fmt.Sprintf("%d %ss", n, noun)
}

// Event entries are written by the app, never by the model.
const (
	eventOpener    = "opener"
	eventDiscarded = "discarded"
	eventPlanSaved = "plan_saved"
)

func writeEvent(ctx context.Context, q *generated.Queries, user uuid.UUID, date pgtype.Date, kind, content string, metadata any) error {
	var raw json.RawMessage
	if metadata != nil {
		var err error
		if raw, err = json.Marshal(metadata); err != nil {
			return err
		}
	}
	_, err := q.CreateChatEvent(ctx, generated.CreateChatEventParams{UserID: user, SessionDate: date, EventType: &kind, Content: content, Metadata: raw})
	return err
}

// modelMessage is how a saved thread entry reaches the model. The opener reads
// as Caprio's own first line; other events are short notes from the app.
func modelMessage(m generated.ChatMessage) mastra.ChatMessage {
	if m.Role != "event" {
		return mastra.ChatMessage{Role: m.Role, Content: m.Content}
	}
	kind := ""
	if m.EventType != nil {
		kind = *m.EventType
	}
	switch kind {
	case eventOpener:
		return mastra.ChatMessage{Role: "assistant", Content: m.Content}
	case eventDiscarded:
		return mastra.ChatMessage{Role: "system", Content: "[Caprio] The user discarded the draft plan. Nothing from it was saved."}
	case eventPlanSaved:
		return mastra.ChatMessage{Role: "system", Content: "[Caprio] The user confirmed the plan for " + m.SessionDate.Time.Format("2006-01-02") + ". " + m.Content + "."}
	default:
		return mastra.ChatMessage{Role: "system", Content: "[Caprio] " + m.Content}
	}
}

