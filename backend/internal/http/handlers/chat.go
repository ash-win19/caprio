package handlers

import (
	"errors"
	"github.com/ashwinshanmugam/caprio/backend/internal/db"
	"github.com/ashwinshanmugam/caprio/backend/internal/http/middleware"
	"github.com/ashwinshanmugam/caprio/backend/internal/services/chat"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"log/slog"
	"net/http"
	"time"
)

type ChatHandler struct {
	store       *db.Store
	chatService *chat.Service
}

func NewChatHandler(store *db.Store, service *chat.Service) *ChatHandler {
	return &ChatHandler{store: store, chatService: service}
}

func workflowError(c *gin.Context, err error) {
	var validation *chat.ValidationError
	switch {
	case errors.As(err, &validation):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, chat.ErrConflict), errors.Is(err, chat.ErrClosed):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, chat.ErrUnavailable):
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
	case errors.Is(err, pgx.ErrNoRows):
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
	default:
		slog.Error("workflow request failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not save this change. Your saved plan is unchanged; please retry."})
	}
}
func queryDate(c *gin.Context) (pgtype.Date, error) {
	return chat.ParseDate(c.DefaultQuery("date", time.Now().UTC().Format("2006-01-02")))
}
func (h *ChatHandler) GetWorkflow(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(401, gin.H{"error": "unauthorized"})
		return
	}
	date, err := queryDate(c)
	if err != nil {
		workflowError(c, err)
		return
	}
	result, err := h.chatService.Get(c.Request.Context(), userID, date)
	if err != nil {
		workflowError(c, err)
		return
	}
	c.JSON(200, result)
}
func (h *ChatHandler) Sessions(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(401, gin.H{"error": "unauthorized"})
		return
	}
	sessions, err := h.store.Queries.ListChatSessionsByUser(c.Request.Context(), userID)
	if err != nil {
		workflowError(c, err)
		return
	}
	c.JSON(200, gin.H{"sessions": sessions})
}
func (h *ChatHandler) SendMessage(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(401, gin.H{"error": "unauthorized"})
		return
	}
	var req struct {
		Content   string    `json:"content" binding:"required"`
		Date      string    `json:"date" binding:"required"`
		RequestID uuid.UUID `json:"requestId" binding:"required"`
		Model     string    `json:"model"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	date, err := chat.ParseDate(req.Date)
	if err != nil {
		workflowError(c, err)
		return
	}
	result, err := h.chatService.Process(c.Request.Context(), chat.ProcessRequest{UserID: userID, SessionDate: date, Content: req.Content, RequestID: req.RequestID, Model: req.Model})
	if err != nil {
		workflowError(c, err)
		return
	}
	c.JSON(200, result)
}
func (h *ChatHandler) Confirm(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(401, gin.H{"error": "unauthorized"})
		return
	}
	var req struct {
		Date       string    `json:"date" binding:"required"`
		ProposalID uuid.UUID `json:"proposalId" binding:"required"`
		Version    int32     `json:"version"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	date, err := chat.ParseDate(req.Date)
	if err != nil {
		workflowError(c, err)
		return
	}
	result, err := h.chatService.Confirm(c.Request.Context(), userID, date, req.ProposalID, req.Version)
	if err != nil {
		workflowError(c, err)
		return
	}
	c.JSON(200, result)
}

func (h *ChatHandler) Discard(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(401, gin.H{"error": "unauthorized"})
		return
	}
	var req struct {
		Date       string    `json:"date" binding:"required"`
		ProposalID uuid.UUID `json:"proposalId" binding:"required"`
		Version    int32     `json:"version"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	date, err := chat.ParseDate(req.Date)
	if err != nil {
		workflowError(c, err)
		return
	}
	result, err := h.chatService.Discard(c.Request.Context(), userID, date, req.ProposalID, req.Version)
	if err != nil {
		workflowError(c, err)
		return
	}
	c.JSON(200, result)
}
