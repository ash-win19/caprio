package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ashwinshanmugam/caprio/backend/internal/db"
	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/ashwinshanmugam/caprio/backend/internal/http/middleware"
)

// DayCloseHandler handles the end-of-day closeout workflow.
type DayCloseHandler struct {
	store *db.Store
}

// NewDayCloseHandler creates a new DayCloseHandler.
func NewDayCloseHandler(store *db.Store) *DayCloseHandler {
	return &DayCloseHandler{store: store}
}

// dayCloseRequest is the JSON body for the day close endpoint.
type dayCloseRequest struct {
	Date        string       `json:"date" binding:"required"`        // "2006-01-02"
	EnergyLevel *int32       `json:"energyLevel"`
	Notes       *string      `json:"notes"`
	TaskActions []taskAction `json:"taskActions" binding:"required,dive"`
}

// taskAction represents a single task disposition during day close.
type taskAction struct {
	TaskID uuid.UUID `json:"taskId" binding:"required"`
	Action string    `json:"action" binding:"required"` // "done", "tomorrow", "drop"
}

// Close handles POST /api/day/close.
func (h *DayCloseHandler) Close(c *gin.Context) {
	ctx := c.Request.Context()

	// 1. Authenticate.
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	// 2. Bind JSON request.
	var req dayCloseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 3. Parse the date.
	t, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date format, expected YYYY-MM-DD"})
		return
	}

	// 4. Convert to pgtype.Date.
	pgDate := pgtype.Date{Time: t, Valid: true}

	// 5. Validate action values.
	validActions := map[string]bool{"done": true, "tomorrow": true, "drop": true}
	for _, ta := range req.TaskActions {
		if !validActions[ta.Action] {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("invalid action %q for task %s; must be done, tomorrow, or drop", ta.Action, ta.TaskID)})
			return
		}
	}

	// 6. Idempotency check: if a standup session already exists for this date, return it.
	existingSession, err := h.store.Queries.GetStandupByUserAndDate(ctx, generated.GetStandupByUserAndDateParams{
		UserID:      userID,
		SessionDate: pgDate,
	})
	if err == nil {
		// Session already exists — return idempotent response.
		c.JSON(http.StatusOK, gin.H{
			"session":                existingSession,
			"completedCount":         existingSession.TasksCompleted,
			"carriedToTomorrowCount": existingSession.TasksPlanned - existingSession.TasksCompleted,
			"droppedCount":           int32(0),
			"nextDate":              t.AddDate(0, 0, 1).Format("2006-01-02"),
		})
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	// 7. Build a set of submitted task IDs for validation.
	submittedIDs := make(map[uuid.UUID]struct{}, len(req.TaskActions))
	for _, ta := range req.TaskActions {
		submittedIDs[ta.TaskID] = struct{}{}
	}

	// 8. Fetch all tasks for the date.
	tasks, err := h.store.Queries.ListAllTasksByUserAndDate(ctx, generated.ListAllTasksByUserAndDateParams{
		UserID:         userID,
		PlannedForDate: pgDate,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	// 9. Build a map of taskID -> Task.
	taskMap := make(map[uuid.UUID]generated.Task, len(tasks))
	for _, task := range tasks {
		taskMap[task.ID] = task
	}

	// 10. Validate every submitted taskID exists in the map.
	for id := range submittedIDs {
		if _, exists := taskMap[id]; !exists {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("task %s not found for date %s", id, req.Date)})
			return
		}
	}

	// 11. Compute next date.
	nextDate := pgtype.Date{Time: t.AddDate(0, 0, 1), Valid: true}

	// 12. Counters.
	var doneCount, tomorrowCount, droppedCount int32

	// 13. Execute all in a single transaction.
	var session generated.StandupSession
	err = h.store.WithTx(ctx, func(q *generated.Queries) error {
		for _, ta := range req.TaskActions {
			switch ta.Action {
			case "done":
				if err := q.CloseTaskDone(ctx, generated.CloseTaskDoneParams{
					ID:     ta.TaskID,
					UserID: userID,
				}); err != nil {
					return err
				}
				doneCount++
			case "tomorrow":
				if err := q.CloseTaskTomorrow(ctx, generated.CloseTaskTomorrowParams{
					ID:             ta.TaskID,
					UserID:         userID,
					PlannedForDate: nextDate,
				}); err != nil {
					return err
				}
				tomorrowCount++
			case "drop":
				if err := q.CloseTaskDrop(ctx, generated.CloseTaskDropParams{
					ID:     ta.TaskID,
					UserID: userID,
				}); err != nil {
					return err
				}
				droppedCount++
			}
		}

		// Create standup session.
		s, err := q.CreateStandupSession(ctx, generated.CreateStandupSessionParams{
			UserID:       userID,
			SessionDate:  pgDate,
			EnergyLevel:  req.EnergyLevel,
			Notes:        req.Notes,
			TasksPlanned: int32(len(req.TaskActions)),
		})
		if err != nil {
			return err
		}

		// Update with tasks_completed.
		s, err = q.UpdateStandupSession(ctx, generated.UpdateStandupSessionParams{
			TasksCompleted: &doneCount,
			ID:             s.ID,
		})
		if err != nil {
			return err
		}

		session = s
		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	// 14. Return response.
	c.JSON(http.StatusOK, gin.H{
		"session":                session,
		"completedCount":         doneCount,
		"carriedToTomorrowCount": tomorrowCount,
		"droppedCount":           droppedCount,
		"nextDate":               nextDate.Time.Format("2006-01-02"),
	})
}
