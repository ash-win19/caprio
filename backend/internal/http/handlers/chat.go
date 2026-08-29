package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ashwinshanmugam/caprio/backend/internal/db"
	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/ashwinshanmugam/caprio/backend/internal/http/middleware"
	"github.com/ashwinshanmugam/caprio/backend/internal/services/chat"
)

// ChatHandler handles chat-related endpoints.
type ChatHandler struct {
	store       *db.Store
	chatService chat.Processor
}

// NewChatHandler creates a new ChatHandler.
func NewChatHandler(store *db.Store, chatService chat.Processor) *ChatHandler {
	return &ChatHandler{
		store:       store,
		chatService: chatService,
	}
}

// parseDateParam parses a date string in YYYY-MM-DD format to pgtype.Date.
func parseDateParam(dateStr string) (pgtype.Date, error) {
	t, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return pgtype.Date{}, err
	}
	return pgtype.Date{Time: t, Valid: true}, nil
}

// GetMessages returns all chat messages for a given date.
func (h *ChatHandler) GetMessages(c *gin.Context) {
	ctx := c.Request.Context()
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	dateStr := c.Param("date")
	sessionDate, err := parseDateParam(dateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date format, expected YYYY-MM-DD"})
		return
	}

	messages, err := h.store.Queries.ListChatMessagesByUserAndDate(ctx, generated.ListChatMessagesByUserAndDateParams{
		UserID:      userID,
		SessionDate: sessionDate,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"messages": messages})
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

	dateStr := c.Param("date")
	sessionDate, err := parseDateParam(dateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date format, expected YYYY-MM-DD"})
		return
	}

	var req sendMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Store the user message.
	userMsg, err := h.store.Queries.CreateChatMessage(ctx, generated.CreateChatMessageParams{
		UserID:      userID,
		SessionDate: sessionDate,
		Role:        "user",
		Content:     req.Content,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to store user message"})
		return
	}

	// Get all messages for this session to provide context.
	allMessages, err := h.store.Queries.ListChatMessagesByUserAndDate(ctx, generated.ListChatMessagesByUserAndDateParams{
		UserID:      userID,
		SessionDate: sessionDate,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conversation history"})
		return
	}

	// Convert to service format.
	var chatMessages []chat.Message
	for _, msg := range allMessages {
		chatMessages = append(chatMessages, chat.Message{
			Role:    msg.Role,
			Content: msg.Content,
		})
	}

	// Process with AI.
	response, err := h.chatService.Process(ctx, chat.ProcessRequest{
		Messages: chatMessages,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to process message"})
		return
	}

	// Store the assistant message.
	assistantMsg, err := h.store.Queries.CreateChatMessage(ctx, generated.CreateChatMessageParams{
		UserID:      userID,
		SessionDate: sessionDate,
		Role:        "assistant",
		Content:     response.Message,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to store assistant message"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"userMessage":      userMsg,
		"assistantMessage": assistantMsg,
		"response":         response,
	})
}

// confirmTasksRequest is the request body for confirming tasks from chat.
type confirmTasksRequest struct {
	Tasks []confirmTask `json:"tasks" binding:"required"`
}

type confirmTask struct {
	Title          string  `json:"title" binding:"required"`
	Description    *string `json:"description"`
	Duration       *int32  `json:"duration"`
	Urgency        string  `json:"urgency"`
	PriorityReason *string `json:"priorityReason"`
}

// ConfirmTasks creates tasks from the confirmed chat session.
func (h *ChatHandler) ConfirmTasks(c *gin.Context) {
	ctx := c.Request.Context()
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	dateStr := c.Param("date")
	sessionDate, err := parseDateParam(dateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date format, expected YYYY-MM-DD"})
		return
	}

	var req confirmTasksRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var createdTasks []generated.Task
	for i, task := range req.Tasks {
		urgency := task.Urgency
		if urgency == "" {
			urgency = "medium"
		}

		createdTask, err := h.store.Queries.CreateTask(ctx, generated.CreateTaskParams{
			UserID:         userID,
			Title:          task.Title,
			Description:    task.Description,
			Urgency:        generated.UrgencyLevel(urgency),
			Duration:       task.Duration,
			Source:         generated.TaskSourceManual,
			SortOrder:      int32(i),
			PlannedForDate: sessionDate,
			Status:         generated.TaskStatusPlanned,
			PriorityReason: task.PriorityReason,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create task"})
			return
		}
		createdTasks = append(createdTasks, createdTask)
	}

	c.JSON(http.StatusOK, gin.H{"tasks": createdTasks})
}
