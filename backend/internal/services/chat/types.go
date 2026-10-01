package chat

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

var ErrConflict = errors.New("the plan changed; reload and review a new proposal")
var ErrClosed = errors.New("this day is closed; start the next day's plan")
var ErrUnavailable = errors.New("the planning assistant is not configured")
var ErrModelCapacity = errors.New("the planning model is overloaded or timed out; try again or switch models")
var ErrTurnInProgress = errors.New("still replying to your last message")

type ValidationError struct {
	Code    string
	Message string
}

func (e *ValidationError) Error() string       { return e.Message }
func invalid(format string, args ...any) error { return invalidCode("validation", format, args...) }
func invalidCode(code, format string, args ...any) error {
	return &ValidationError{Code: code, Message: fmt.Sprintf(format, args...)}
}

type Review struct {
	CarriedToDate          string `json:"carriedToDate,omitempty"`
	Automatic              bool   `json:"automatic,omitempty"`
	CompletedCount         int32  `json:"completedCount"`
	CarriedToTomorrowCount int32  `json:"carriedToTomorrowCount"`
	DroppedCount           int32  `json:"droppedCount"`
	Notes                  string `json:"notes"`
	EnergyLevel            *int32 `json:"energyLevel"`
}
type ReviewRecord struct {
	ID                   uuid.UUID        `json:"id"`
	CreatedAt            string           `json:"createdAt"`
	Review               Review           `json:"review"`
	Tasks                []generated.Task `json:"tasks"`
	TaskDetailsAvailable bool             `json:"taskDetailsAvailable"`
}

type Workflow struct {
	ChangeReceipts       []ChangeReceipt         `json:"changeReceipts"`
	ReviewHistory        []ReviewRecord          `json:"reviewHistory"`
	CarryoverOrigins     map[string]string       `json:"carryoverOrigins"`
	Date                 string                  `json:"date"`
	State                string                  `json:"state"`
	Version              int32                   `json:"version"`
	Messages             []generated.ChatMessage `json:"messages"`
	Plan                 *PlanView               `json:"plan"`
	AvailableMinutes     *int32                  `json:"availableMinutes"`
	Tasks                []generated.Task        `json:"tasks"`
	Backlog              []generated.Task        `json:"backlog"`
	Review               *Review                 `json:"review"`
	OldestUnclosedDate   *string                 `json:"oldestUnclosedDate"`
	Opener               *string                 `json:"opener,omitempty"`
	draft                *Draft
	TaskDetailsAvailable bool `json:"taskDetailsAvailable"`
}

func ParseDate(value string) (pgtype.Date, error) {
	t, err := time.Parse("2006-01-02", value)
	if err != nil || t.Year() < 2000 || t.Year() > 2100 {
		return pgtype.Date{}, invalid("invalid date format, expected YYYY-MM-DD")
	}
	return pgtype.Date{Time: t, Valid: true}, nil
}

func snapshot(tasks, backlog []generated.Task) string {
	combined := append(append([]generated.Task{}, tasks...), backlog...)
	sort.Slice(combined, func(i, j int) bool { return bytes.Compare(combined[i].ID[:], combined[j].ID[:]) < 0 })
	b, _ := json.Marshal(combined)
	return fmt.Sprintf("%x", sha256.Sum256(b))
}
