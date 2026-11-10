package chat

import (
	"time"

	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
)

// staleDays is how many Days a Carried task rolls forward before it is a
// Stale task.
const staleDays = 3

func isStale(carriedDays int) bool { return carriedDays >= staleDays }

// carriedDays is how many Days an unfinished Carried task has rolled forward:
// from the day in its carryover record to the day it is planned for now. It is
// zero for a task that isn't carried; a carried task with no record counts its
// carries.
func carriedDays(t generated.Task, origins map[string]string) int {
	if t.Completed || t.Status != generated.TaskStatusPlanned || !carried(t) {
		return 0
	}
	origin, err := time.Parse("2006-01-02", origins[t.ID.String()])
	if err != nil {
		return int(t.DeferCount)
	}
	return max(1, int(t.PlannedForDate.Time.Sub(origin).Hours()/24))
}
