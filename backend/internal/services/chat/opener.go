package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/ashwinshanmugam/caprio/backend/internal/mastra"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// The opener names this many carried tasks, and this many Stale tasks, before
// counting the rest.
const (
	openerNamedTasks = 5
	openerNamedStale = 3
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
		text = greeting + "." + carriedSummary(tasks, origins) + " What's on today?"
	}
	return &text
}

// carriedSummary names the day's carried tasks and calls out the Stale ones,
// oldest first. It is empty when nothing carried over.
func carriedSummary(tasks []generated.Task, origins map[string]string) string {
	type aged struct {
		title string
		days  int
	}
	var rolled, stale []aged
	fromYesterday := true
	for _, t := range tasks {
		days := carriedDays(t, origins)
		if days == 0 {
			continue
		}
		rolled = append(rolled, aged{t.Title, days})
		fromYesterday = fromYesterday && days == 1
		if isStale(days) {
			stale = append(stale, aged{t.Title, days})
		}
	}
	if len(rolled) == 0 {
		return ""
	}
	names := []string{}
	for i, c := range rolled {
		if i == openerNamedTasks {
			names = append(names, fmt.Sprintf("%d more", len(rolled)-i))
			break
		}
		names = append(names, c.title)
	}
	when := ""
	if fromYesterday {
		when = " from yesterday"
	}
	text := fmt.Sprintf(" %s carried over%s: %s.", plural(len(rolled), "task"), when, joinAnd(names))
	if len(stale) == 0 {
		return text
	}
	if len(rolled) == 1 {
		return text + fmt.Sprintf(" It has carried over for %d days.", stale[0].days)
	}
	sort.SliceStable(stale, func(i, j int) bool { return stale[i].days > stale[j].days })
	ages := []string{fmt.Sprintf("%s has carried over for %d days", stale[0].title, stale[0].days)}
	for _, s := range stale[1:min(len(stale), openerNamedStale)] {
		ages = append(ages, fmt.Sprintf("%s for %d", s.title, s.days))
	}
	text += " " + joinAnd(ages)
	if rest := len(stale) - openerNamedStale; rest > 0 {
		text += fmt.Sprintf(", and %d more for %d days or longer", rest, staleDays)
	}
	return text + "."
}

// joinAnd writes a list the way a person would: "A, B and C".
func joinAnd(items []string) string {
	if len(items) < 2 {
		return strings.Join(items, "")
	}
	return strings.Join(items[:len(items)-1], ", ") + " and " + items[len(items)-1]
}

func plural(n int, noun string) string {
	if n == 1 {
		return fmt.Sprintf("1 %s", noun)
	}
	return fmt.Sprintf("%d %ss", n, noun)
}

// Event entries are written by the app, never by the model.
const (
	eventOpener     = "opener"
	eventDiscarded  = "discarded"
	eventPlanSaved  = "plan_saved"
	eventPlanUpdate = "plan_update"
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
