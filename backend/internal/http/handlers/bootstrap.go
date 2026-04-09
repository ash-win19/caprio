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

// BootstrapHandler serves the single payload the frontend loads on app open.
type BootstrapHandler struct {
	store *db.Store
}

// NewBootstrapHandler creates a new BootstrapHandler.
func NewBootstrapHandler(store *db.Store) *BootstrapHandler {
	return &BootstrapHandler{store: store}
}

// Get assembles user data, preferences, categories, today's tasks, and
// backlog into one response so the frontend can hydrate in a single round-trip.
func (h *BootstrapHandler) Get(c *gin.Context) {
	ctx := c.Request.Context()

	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	user, err := h.store.Queries.GetUserByID(ctx, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load user"})
		return
	}

	categories, err := h.store.Queries.ListCategoriesByUser(ctx, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load categories"})
		return
	}

	todayPgDate := pgtype.Date{Time: time.Now().Truncate(24 * time.Hour), Valid: true}
	todayTasks, err := h.store.Queries.ListTodayTasksByUser(ctx, generated.ListTodayTasksByUserParams{
		UserID:         userID,
		PlannedForDate: todayPgDate,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load today tasks"})
		return
	}

	backlog, err := h.store.Queries.ListBacklogTasks(ctx, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load backlog"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"user": gin.H{
			"id":    user.ID,
			"email": user.Email,
			"name":  user.Name,
		},
		"preferences": gin.H{
			"briefTime":                 user.BriefTime,
			"nudgeFrequency":            user.NudgeFrequency,
			"proactiveReprioritization": user.ProactiveReprioritization,
			"eodReminder":               user.EodReminder,
			"eodTime":                   user.EodTime,
			"micSensitivity":            user.MicSensitivity,
			"language":                  user.Language,
			"saveTranscripts":           user.SaveTranscripts,
		},
		"categories": categories,
		"todayTasks": todayTasks,
		"backlog":    backlog,
		"streak":     user.Streak,
	})
}
