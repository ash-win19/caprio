package handlers

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/ashwinshanmugam/caprio/backend/internal/services/chat"
	"github.com/gin-gonic/gin"
)

// PlannerToolAuth admits only the planner agent, which presents the shared
// secret. Without a configured secret the endpoint is closed.
func PlannerToolAuth(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		given := c.GetHeader("X-Caprio-Internal")
		if secret == "" || subtle.ConstantTimeCompare([]byte(given), []byte(secret)) != 1 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		c.Next()
	}
}

type PlannerToolHandler struct{ chat *chat.Service }

func NewPlannerToolHandler(service *chat.Service) *PlannerToolHandler {
	return &PlannerToolHandler{chat: service}
}

// Apply runs one planner tool call for the turn named by X-Caprio-Turn.
// Validation problems are part of the 200 result so the model can react.
func (h *PlannerToolHandler) Apply(c *gin.Context) {
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, 64<<10))
	if err != nil || (len(body) > 0 && !json.Valid(body)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tool input"})
		return
	}
	result, err := h.chat.ApplyTool(c.Request.Context(), c.GetHeader("X-Caprio-Turn"), c.Param("name"), body)
	if errors.Is(err, chat.ErrToolAuth) {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	if err != nil {
		workflowError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}
