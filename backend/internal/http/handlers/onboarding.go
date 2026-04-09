package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/ashwinshanmugam/caprio/backend/internal/db"
	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/ashwinshanmugam/caprio/backend/internal/http/middleware"
)

type onboardingRequest struct {
	Preferences *onboardingPreferences `json:"preferences"`
	Categories  []onboardingCategory   `json:"categories"`
}

type onboardingPreferences struct {
	BriefTime                 *string  `json:"briefTime"`
	NudgeFrequency            *string  `json:"nudgeFrequency"`
	ProactiveReprioritization *bool    `json:"proactiveReprioritization"`
	EodReminder               *bool    `json:"eodReminder"`
	EodTime                   *string  `json:"eodTime"`
	MicSensitivity            *float64 `json:"micSensitivity"`
	Language                  *string  `json:"language"`
	SaveTranscripts           *bool    `json:"saveTranscripts"`
}

type onboardingCategory struct {
	Name         string   `json:"name" binding:"required"`
	Color        string   `json:"color" binding:"required"`
	HoursPerWeek *float64 `json:"hoursPerWeek"`
}

// OnboardingHandler handles onboarding-related API requests.
type OnboardingHandler struct {
	store *db.Store
}

// NewOnboardingHandler creates a new OnboardingHandler.
func NewOnboardingHandler(store *db.Store) *OnboardingHandler {
	return &OnboardingHandler{store: store}
}

// Complete persists user preferences and category selections during onboarding.
func (h *OnboardingHandler) Complete(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req onboardingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()

	err := h.store.WithTx(ctx, func(q *generated.Queries) error {
		if req.Preferences != nil {
			if _, err := q.UpdateUserPrefs(ctx, generated.UpdateUserPrefsParams{
				BriefTime:                 req.Preferences.BriefTime,
				NudgeFrequency:            req.Preferences.NudgeFrequency,
				ProactiveReprioritization: req.Preferences.ProactiveReprioritization,
				EodReminder:               req.Preferences.EodReminder,
				EodTime:                   req.Preferences.EodTime,
				MicSensitivity:            req.Preferences.MicSensitivity,
				Language:                  req.Preferences.Language,
				SaveTranscripts:           req.Preferences.SaveTranscripts,
				ID:                        userID,
			}); err != nil {
				return err
			}
		}

		if len(req.Categories) > 0 {
			existing, err := q.ListCategoriesByUser(ctx, userID)
			if err != nil {
				return err
			}

			for _, cat := range existing {
				if err := q.DeleteCategory(ctx, generated.DeleteCategoryParams{
					ID:     cat.ID,
					UserID: userID,
				}); err != nil {
					return err
				}
			}

			for i, cat := range req.Categories {
				if _, err := q.CreateCategory(ctx, generated.CreateCategoryParams{
					UserID:       userID,
					Name:         cat.Name,
					Color:        cat.Color,
					HoursPerWeek: cat.HoursPerWeek,
					SortOrder:    int32(i),
				}); err != nil {
					return err
				}
			}
		}

		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save onboarding"})
		return
	}

	user, _ := h.store.Queries.GetUserByID(ctx, userID)
	categories, _ := h.store.Queries.ListCategoriesByUser(ctx, userID)

	c.JSON(http.StatusOK, gin.H{
		"user":       user,
		"categories": categories,
	})
}
