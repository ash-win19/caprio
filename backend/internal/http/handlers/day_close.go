package handlers

import (
	"github.com/ashwinshanmugam/caprio/backend/internal/db"
	"github.com/ashwinshanmugam/caprio/backend/internal/http/middleware"
	"github.com/ashwinshanmugam/caprio/backend/internal/services/chat"
	"github.com/gin-gonic/gin"
)

type DayCloseHandler struct{ service *chat.Service }

func NewDayCloseHandler(store *db.Store) *DayCloseHandler {
	return &DayCloseHandler{service: chat.NewService(store, nil)}
}
func (h *DayCloseHandler) Close(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(401, gin.H{"error": "unauthorized"})
		return
	}
	var req chat.CloseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	result, err := h.service.Close(c.Request.Context(), userID, req)
	if err != nil {
		workflowError(c, err)
		return
	}
	c.JSON(200, result)
}
