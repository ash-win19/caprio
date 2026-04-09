package reprioritize

import "github.com/google/uuid"

// Input is everything the handler assembles and passes to the service.
type Input struct {
	Tasks           []TaskSummary
	UserPreferences UserPrefs
	VoiceTranscript string // empty if no voice entry
	TargetDate      string // "2026-04-09" format
}

// TaskSummary is a flattened view of a task for prompt construction.
type TaskSummary struct {
	ID           uuid.UUID `json:"id"`
	Title        string    `json:"title"`
	Description  string    `json:"description"`
	Urgency      string    `json:"urgency"`
	Duration     *int32    `json:"duration"`
	DeferCount   int32     `json:"deferCount"`
	DueDate      string    `json:"dueDate"`
	CurrentOrder int32     `json:"currentOrder"`
}

// UserPrefs is the subset of user preferences relevant to prioritization.
type UserPrefs struct {
	BriefTime      string `json:"briefTime"`
	NudgeFrequency string `json:"nudgeFrequency"`
	EodTime        string `json:"eodTime"`
}

// Result is what the service returns to the handler.
type Result struct {
	OrderedTasks []RankedTask `json:"orderedTasks"`
}

// RankedTask is a single task with its new position and rationale.
type RankedTask struct {
	TaskID uuid.UUID `json:"taskId"`
	Rank   int32     `json:"rank"`
	Reason string    `json:"reason"`
}
