package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ashwinshanmugam/caprio/backend/internal/db"
	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/ashwinshanmugam/caprio/backend/internal/http/middleware"
)

// DayHandler handles day-related queries.
type DayHandler struct {
	store *db.Store
}

// NewDayHandler creates a new DayHandler.
func NewDayHandler(store *db.Store) *DayHandler {
	return &DayHandler{store: store}
}

// GetStatus returns whether the given day has any tasks.
func (h *DayHandler) GetStatus(c *gin.Context) {
	ctx := c.Request.Context()
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	dateStr := c.Param("date")
	t, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date format, expected YYYY-MM-DD"})
		return
	}
	pgDate := pgtype.Date{Time: t, Valid: true}

	// Check for tasks.
	tasks, err := h.store.Queries.ListAllTasksByUserAndDate(ctx, generated.ListAllTasksByUserAndDateParams{
		UserID:         userID,
		PlannedForDate: pgDate,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"date":      dateStr,
		"hasTasks":  len(tasks) > 0,
		"taskCount": len(tasks),
	})
}

// GetLeftovers returns yesterday's unchecked tasks (leftovers).
func (h *DayHandler) GetLeftovers(c *gin.Context) {
	ctx := c.Request.Context()
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	// Calculate yesterday's date.
	yesterday := time.Now().AddDate(0, 0, -1).Truncate(24 * time.Hour)
	yesterdayPg := pgtype.Date{Time: yesterday, Valid: true}

	// Get yesterday's unchecked tasks.
	leftovers, err := h.store.Queries.ListYesterdayLeftovers(ctx, generated.ListYesterdayLeftoversParams{
		UserID:         userID,
		PlannedForDate: yesterdayPg,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	// Mark them as leftovers (carried over) if not already marked.
	for _, leftover := range leftovers {
		if !leftover.CarriedOver {
			if err := h.store.Queries.MarkTaskAsLeftover(ctx, generated.MarkTaskAsLeftoverParams{
				ID:     leftover.ID,
				UserID: userID,
			}); err != nil {
				// Log but don't fail
				continue
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"leftovers": leftovers})
}
