package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/ashwinshanmugam/caprio/backend/internal/db"
	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/ashwinshanmugam/caprio/backend/internal/http/middleware"
)

// VoiceEntryHandler handles all voice-entry-related HTTP endpoints.
type VoiceEntryHandler struct {
	store *db.Store
}

// NewVoiceEntryHandler creates a new VoiceEntryHandler with the given store.
func NewVoiceEntryHandler(store *db.Store) *VoiceEntryHandler {
	return &VoiceEntryHandler{store: store}
}

// createVoiceEntryRequest is the JSON body for creating a voice entry.
type createVoiceEntryRequest struct {
	Transcript string `json:"transcript" binding:"required"`
}

// Create adds a new voice entry for the current user.
func (h *VoiceEntryHandler) Create(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req createVoiceEntryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	entry, err := h.store.Queries.CreateVoiceEntry(c.Request.Context(), generated.CreateVoiceEntryParams{
		UserID:     userID,
		Transcript: req.Transcript,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	c.JSON(http.StatusCreated, entry)
}
