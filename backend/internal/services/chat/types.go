package chat

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"
	"time"

	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

var ErrConflict = errors.New("the plan changed; reload and review a new proposal")
var ErrClosed = errors.New("this day is closed; start the next day's plan")
var ErrUnavailable = errors.New("the planning assistant is not configured")

type ValidationError struct{ Message string }

func (e *ValidationError) Error() string       { return e.Message }
func invalid(format string, args ...any) error { return &ValidationError{fmt.Sprintf(format, args...)} }

type ProposalTask struct {
	ID          *uuid.UUID `json:"id,omitempty"`
	Title       string     `json:"title"`
	Duration    int32      `json:"duration"`
	Urgency     string     `json:"urgency"`
	CategoryID  *uuid.UUID `json:"categoryId,omitempty"`
	Disposition string     `json:"disposition"`
	Reason      string     `json:"reason"`
}
type AgentReply struct {
	Message          string         `json:"message"`
	Phase            string         `json:"phase"`
	AvailableMinutes *int32         `json:"availableMinutes"`
	Tasks            []ProposalTask `json:"tasks"`
}
type Proposal struct {
	ID               uuid.UUID      `json:"id"`
	Summary          string         `json:"summary"`
	AvailableMinutes *int32         `json:"availableMinutes"`
	Tasks            []ProposalTask `json:"tasks"`
}
type Review struct {
	CompletedCount         int32  `json:"completedCount"`
	CarriedToTomorrowCount int32  `json:"carriedToTomorrowCount"`
	DroppedCount           int32  `json:"droppedCount"`
	Notes                  string `json:"notes"`
	EnergyLevel            *int32 `json:"energyLevel"`
}
type Workflow struct {
	Date     string                  `json:"date"`
	State    string                  `json:"state"`
	Version  int32                   `json:"version"`
	Messages []generated.ChatMessage `json:"messages"`
	Proposal *Proposal               `json:"proposal"`
	Tasks    []generated.Task        `json:"tasks"`
	Backlog  []generated.Task        `json:"backlog"`
	Review   *Review                 `json:"review"`
}

func ParseDate(value string) (pgtype.Date, error) {
	t, err := time.Parse("2006-01-02", value)
	if err != nil || t.Year() < 2000 || t.Year() > 2100 {
		return pgtype.Date{}, invalid("invalid date format, expected YYYY-MM-DD")
	}
	return pgtype.Date{Time: t, Valid: true}, nil
}

// ParseAgentReply accepts only the documented JSON contract. Model-generated IDs
// and category IDs are checked against the authenticated user's current data.
func ParseAgentReply(text string, tasks, backlog []generated.Task, categories []generated.Category) (*AgentReply, error) {
	if len(text) > 100000 {
		return nil, invalid("assistant response too large")
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal([]byte(text), &fields); err != nil {
		return nil, invalid("assistant returned invalid plan JSON")
	}
	for _, field := range []string{"message", "phase", "availableMinutes", "tasks"} {
		if _, ok := fields[field]; !ok {
			return nil, invalid("assistant omitted required field %s", field)
		}
	}
	dec := json.NewDecoder(strings.NewReader(text))
	dec.DisallowUnknownFields()
	var reply AgentReply
	if err := dec.Decode(&reply); err != nil {
		return nil, invalid("assistant returned invalid plan JSON")
	}
	if err := dec.Decode(new(any)); err != io.EOF {
		return nil, invalid("assistant returned trailing content")
	}
	reply.Message = strings.TrimSpace(reply.Message)
	if reply.Message == "" || len(reply.Message) > 6000 {
		return nil, invalid("assistant message must contain 1 to 6000 characters")
	}
	if reply.AvailableMinutes != nil && (*reply.AvailableMinutes < 0 || *reply.AvailableMinutes > 1440) {
		return nil, invalid("availableMinutes must be between 0 and 1440")
	}
	if reply.Phase == "clarifying" {
		if reply.Tasks == nil || len(reply.Tasks) != 0 {
			return nil, invalid("clarifying responses require an empty tasks array")
		}
		return &reply, nil
	}
	if reply.Phase != "proposal" || reply.Tasks == nil || len(reply.Tasks) > 100 {
		return nil, invalid("invalid proposal phase or tasks")
	}
	eligible := map[uuid.UUID]bool{}
	required := map[uuid.UUID]bool{}
	for _, task := range tasks {
		if task.Status == generated.TaskStatusPlanned && !task.Completed {
			eligible[task.ID] = true
			required[task.ID] = true
		}
	}
	for _, task := range backlog {
		if !task.Completed {
			eligible[task.ID] = true
		}
	}
	cats := map[uuid.UUID]bool{}
	for _, cat := range categories {
		cats[cat.ID] = true
	}
	seen := map[uuid.UUID]bool{}
	total := int32(0)
	for i := range reply.Tasks {
		task := &reply.Tasks[i]
		task.Title = strings.TrimSpace(task.Title)
		task.Reason = strings.TrimSpace(task.Reason)
		if task.Title == "" || len(task.Title) > 500 || task.Duration < 5 || task.Duration > 1440 || len(task.Reason) == 0 || len(task.Reason) > 1000 {
			return nil, invalid("invalid proposal task details")
		}
		if task.Urgency != "low" && task.Urgency != "medium" && task.Urgency != "high" {
			return nil, invalid("invalid task urgency")
		}
		if task.Disposition != "today" && task.Disposition != "backlog" {
			return nil, invalid("invalid task disposition")
		}
		if task.CategoryID != nil && !cats[*task.CategoryID] {
			return nil, invalid("unknown category in proposal")
		}
		if task.ID != nil {
			if !eligible[*task.ID] || seen[*task.ID] {
				return nil, invalid("unknown, completed, or repeated task in proposal")
			}
			seen[*task.ID] = true
		}
		if task.Disposition == "today" {
			total += task.Duration
		}
	}
	for id := range required {
		if !seen[id] {
			return nil, invalid("proposal omitted an unfinished task")
		}
	}
	if reply.AvailableMinutes != nil && total > *reply.AvailableMinutes {
		return nil, invalid("proposed tasks exceed the available time")
	}
	return &reply, nil
}

func snapshot(tasks, backlog []generated.Task) string {
	combined := append(append([]generated.Task{}, tasks...), backlog...)
	sort.Slice(combined, func(i, j int) bool { return bytes.Compare(combined[i].ID[:], combined[j].ID[:]) < 0 })
	b, _ := json.Marshal(combined)
	return fmt.Sprintf("%x", sha256.Sum256(b))
}
