package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ashwinshanmugam/caprio/backend/internal/db"
	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/ashwinshanmugam/caprio/backend/internal/http/middleware"
	"github.com/ashwinshanmugam/caprio/backend/internal/services/reprioritize"
)

// ReprioritizeHandler orchestrates loading data from the DB, calling the AI
// reprioritization service, and writing the results back.
type ReprioritizeHandler struct {
	store   *db.Store
	service *reprioritize.Service
}

// NewReprioritizeHandler creates a new ReprioritizeHandler.
func NewReprioritizeHandler(store *db.Store, service *reprioritize.Service) *ReprioritizeHandler {
	return &ReprioritizeHandler{store: store, service: service}
}

// reprioritizeRequest is the JSON body for the reprioritize endpoint.
type reprioritizeRequest struct {
	VoiceEntryID *uuid.UUID `json:"voiceEntryId"`
	TargetDate   *string    `json:"targetDate"` // "2006-01-02" format, defaults to today
}

// Reprioritize handles POST /api/tasks/reprioritize.
func (h *ReprioritizeHandler) Reprioritize(c *gin.Context) {
	ctx := c.Request.Context()

	// 1. Authenticate.
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	// 2. Bind JSON — body may be empty, so don't fail on that.
	var req reprioritizeRequest
	_ = c.ShouldBindJSON(&req)

	// 3. Resolve target date.
	var pgDate pgtype.Date
	var dateStr string

	if req.TargetDate != nil {
		t, err := time.Parse("2006-01-02", *req.TargetDate)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid targetDate format"})
			return
		}
		pgDate = pgtype.Date{Time: t, Valid: true}
		dateStr = t.Format("2006-01-02")
	} else {
		now := time.Now().Truncate(24 * time.Hour)
		pgDate = pgtype.Date{Time: now, Valid: true}
		dateStr = now.Format("2006-01-02")
	}

	// 4. Fetch planned tasks for the target date.
	tasks, err := h.store.Queries.ListTodayTasksByUser(ctx, generated.ListTodayTasksByUserParams{
		UserID:         userID,
		PlannedForDate: pgDate,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	if len(tasks) == 0 {
		c.JSON(http.StatusOK, gin.H{"tasks": []any{}, "changes": []any{}})
		return
	}

	// 5. Fetch user preferences.
	user, err := h.store.Queries.GetUserByID(ctx, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	// 6. Optionally fetch voice entry.
	var voiceTranscript string
	if req.VoiceEntryID != nil {
		entry, err := h.store.Queries.GetVoiceEntryByID(ctx, generated.GetVoiceEntryByIDParams{
			ID:     *req.VoiceEntryID,
			UserID: userID,
		})
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "voice entry not found"})
			return
		}
		voiceTranscript = entry.Transcript
	}

	// 7. Build service input.
	taskSummaries := make([]reprioritize.TaskSummary, len(tasks))
	for i, task := range tasks {
		taskSummaries[i] = reprioritize.TaskSummary{
			ID:           task.ID,
			Title:        task.Title,
			Description:  derefString(task.Description),
			Urgency:      string(task.Urgency),
			Duration:     task.Duration,
			DeferCount:   task.DeferCount,
			DueDate:      formatPgDate(task.DueDate),
			CurrentOrder: task.SortOrder,
		}
	}

	input := reprioritize.Input{
		Tasks: taskSummaries,
		UserPreferences: reprioritize.UserPrefs{
			BriefTime:      user.BriefTime,
			NudgeFrequency: user.NudgeFrequency,
			EodTime:        user.EodTime,
		},
		VoiceTranscript: voiceTranscript,
		TargetDate:      dateStr,
	}

	// 8. Call AI reprioritization service.
	result, err := h.service.Reprioritize(ctx, input)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "reprioritization failed"})
		return
	}

	// 9. Apply results in a transaction.
	err = h.store.WithTx(ctx, func(q *generated.Queries) error {
		for _, rt := range result.OrderedTasks {
			reason := rt.Reason
			rank := rt.Rank
			_, err := q.UpdateTask(ctx, generated.UpdateTaskParams{
				SortOrder:      &rank,
				PriorityReason: &reason,
				ID:             rt.TaskID,
				UserID:         userID,
			})
			if err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	// 10. Fetch refreshed task list.
	updatedTasks, err := h.store.Queries.ListTodayTasksByUser(ctx, generated.ListTodayTasksByUserParams{
		UserID:         userID,
		PlannedForDate: pgDate,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	// 11. Return results.
	c.JSON(http.StatusOK, gin.H{
		"tasks":   updatedTasks,
		"changes": result.OrderedTasks,
	})
}

// derefString safely dereferences a *string, returning "" if nil.
func derefString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// formatPgDate formats a pgtype.Date as "2006-01-02", or "" if invalid.
func formatPgDate(d pgtype.Date) string {
	if !d.Valid {
		return ""
	}
	return d.Time.Format("2006-01-02")
}
