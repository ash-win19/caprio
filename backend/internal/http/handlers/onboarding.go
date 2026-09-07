package handlers

import (
	"github.com/ashwinshanmugam/caprio/backend/internal/db"
	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/ashwinshanmugam/caprio/backend/internal/http/middleware"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"net/http"
	"strings"
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
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Color        string   `json:"color"`
	HoursPerWeek *float64 `json:"hoursPerWeek"`
}
type OnboardingHandler struct{ store *db.Store }

func NewOnboardingHandler(store *db.Store) *OnboardingHandler {
	return &OnboardingHandler{store: store}
}
func (h *OnboardingHandler) Complete(c *gin.Context)       { h.save(c, true) }
func (h *OnboardingHandler) UpdateSettings(c *gin.Context) { h.save(c, false) }

func (h *OnboardingHandler) save(c *gin.Context, onboarding bool) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(401, gin.H{"error": "unauthorized"})
		return
	}
	var req onboardingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if len(req.Categories) > 30 {
		c.JSON(400, gin.H{"error": "at most 30 categories are supported"})
		return
	}
	ctx := c.Request.Context()
	err := h.store.WithUserTx(ctx, userID, func(tx pgx.Tx, q *generated.Queries) error {
		if req.Preferences != nil {
			p := req.Preferences
			if p.MicSensitivity != nil && (*p.MicSensitivity < 0 || *p.MicSensitivity > 100) {
				return badTask("micSensitivity must be between 0 and 100")
			}
			if _, err := q.UpdateUserPrefs(ctx, generated.UpdateUserPrefsParams{ID: userID, BriefTime: p.BriefTime, NudgeFrequency: p.NudgeFrequency, ProactiveReprioritization: p.ProactiveReprioritization, EodReminder: p.EodReminder, EodTime: p.EodTime, MicSensitivity: p.MicSensitivity, Language: p.Language, SaveTranscripts: p.SaveTranscripts}); err != nil {
				return err
			}
		}
		if req.Categories != nil {
			existing, err := q.ListCategoriesByUser(ctx, userID)
			if err != nil {
				return err
			}
			owned := map[uuid.UUID]bool{}
			names := map[string]uuid.UUID{}
			for _, cat := range existing {
				owned[cat.ID] = true
				names[strings.ToLower(cat.Name)] = cat.ID
			}
			keep := map[uuid.UUID]bool{}
			for i, cat := range req.Categories {
				cat.Name = strings.TrimSpace(cat.Name)
				if cat.Name == "" || len(cat.Name) > 100 || len(cat.Color) > 30 || cat.Color == "" {
					return badTask("invalid category name or color")
				}
				if cat.HoursPerWeek != nil && (*cat.HoursPerWeek < 0 || *cat.HoursPerWeek > 168) {
					return badTask("category hours must be between 0 and 168")
				}
				var id uuid.UUID
				if onboarding {
					// Initial client categories can have local IDs. Reuse saved
					// categories by name so retrying onboarding preserves links.
					id = names[strings.ToLower(cat.Name)]
					if id == uuid.Nil {
						id = uuid.New()
					}
				} else {
					var err error
					id, err = uuid.Parse(cat.ID)
					if err != nil || id == uuid.Nil {
						return badTask("settings categories require UUID IDs")
					}
				}
				if keep[id] {
					return badTask("duplicate category")
				}
				keep[id] = true
				if owned[id] {
					if _, err := tx.Exec(ctx, `UPDATE categories SET name=$3,color=$4,hours_per_week=$5,sort_order=$6 WHERE id=$1 AND user_id=$2`, id, userID, cat.Name, cat.Color, cat.HoursPerWeek, i); err != nil {
						return err
					}
				} else {
					// An ID belonging to another user must never be overwritten.
					var exists bool
					if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM categories WHERE id=$1)`, id).Scan(&exists); err != nil {
						return err
					}
					if exists {
						return badTask("category ID is unavailable")
					}
					if _, err := tx.Exec(ctx, `INSERT INTO categories (id,user_id,name,color,hours_per_week,sort_order) VALUES ($1,$2,$3,$4,$5,$6)`, id, userID, cat.Name, cat.Color, cat.HoursPerWeek, i); err != nil {
						return err
					}
				}
			}
			for _, cat := range existing {
				if !keep[cat.ID] {
					if err := q.DeleteCategory(ctx, generated.DeleteCategoryParams{ID: cat.ID, UserID: userID}); err != nil {
						return err
					}
				}
			}
		}
		if onboarding {
			_, err := tx.Exec(ctx, `UPDATE users SET onboarding_complete=true,updated_at=clock_timestamp() WHERE id=$1`, userID)
			return err
		}
		return nil
	})
	if err != nil {
		workflowError(c, err)
		return
	}
	user, err := h.store.Queries.GetUserByID(ctx, userID)
	if err != nil {
		workflowError(c, err)
		return
	}
	categories, err := h.store.Queries.ListCategoriesByUser(ctx, userID)
	if err != nil {
		workflowError(c, err)
		return
	}
	var complete bool
	if err := h.store.Pool.QueryRow(ctx, `SELECT onboarding_complete FROM users WHERE id=$1`, userID).Scan(&complete); err != nil {
		workflowError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": gin.H{"id": user.ID, "email": user.Email, "name": user.Name}, "categories": categories, "onboardingComplete": complete})
}
