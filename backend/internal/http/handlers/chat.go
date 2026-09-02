package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ashwinshanmugam/caprio/backend/internal/db"
	"github.com/ashwinshanmugam/caprio/backend/internal/http/middleware"
	"github.com/ashwinshanmugam/caprio/backend/internal/services/chat"
)

// ChatHandler handles chat-related endpoints.
type ChatHandler struct {
	store       *db.Store
	chatService *chat.Service
}

// NewChatHandler creates a new ChatHandler.
func NewChatHandler(store *db.Store, chatService *chat.Service) *ChatHandler {
	return &ChatHandler{
		store:       store,
		chatService: chatService,
	}
}

// sendMessageRequest is the request body for sending a chat message.
type sendMessageRequest struct {
	Content string `json:"content" binding:"required"`
}

// SendMessage processes a user message and returns the assistant's response.
func (h *ChatHandler) SendMessage(c *gin.Context) {
	ctx := c.Request.Context()
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req sendMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Use today's date for session
	sessionDate := pgtype.Date{Time: time.Now().UTC(), Valid: true}

	// Process: persist user message, call Mastra, persist assistant reply.
	response, err := h.chatService.Process(ctx, chat.ProcessRequest{
		UserID:      userID,
		SessionDate: sessionDate,
		Content:     req.Content,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to process message"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"text": response.AssistantMessage.Content,
	})
}
