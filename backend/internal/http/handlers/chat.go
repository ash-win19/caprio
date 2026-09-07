package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/ashwinshanmugam/caprio/backend/internal/db"
	"github.com/ashwinshanmugam/caprio/backend/internal/http/middleware"
	"github.com/ashwinshanmugam/caprio/backend/internal/services/chat"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type ChatHandler struct {
	store       *db.Store
	chatService *chat.Service
}

func NewChatHandler(store *db.Store, service *chat.Service) *ChatHandler {
	return &ChatHandler{store: store, chatService: service}
}

// workflowStatus maps a service error to the HTTP status and message the client
// should see. Unexpected errors are logged here and reported generically.
func workflowStatus(err error) (int, string) {
	var validation *chat.ValidationError
	switch {
	case errors.As(err, &validation):
		return http.StatusBadRequest, err.Error()
	case errors.Is(err, chat.ErrConflict), errors.Is(err, chat.ErrClosed):
		return http.StatusConflict, err.Error()
	case errors.Is(err, chat.ErrUnavailable):
		return http.StatusServiceUnavailable, err.Error()
	case errors.Is(err, pgx.ErrNoRows):
		return http.StatusNotFound, "task not found"
	default:
		slog.Error("workflow request failed", "error", err)
		return http.StatusInternalServerError, "Could not save this change. Your saved plan is unchanged; please retry."
	}
}

func workflowError(c *gin.Context, err error) {
	status, message := workflowStatus(err)
	c.JSON(status, gin.H{"error": message})
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

type chatMessageRequest struct {
	Content   string    `json:"content" binding:"required"`
	Date      string    `json:"date" binding:"required"`
	RequestID uuid.UUID `json:"requestId" binding:"required"`
	Model     string    `json:"model"`
}

// bindMessage validates a chat request. It has already answered the client
// when ok is false.
func (h *ChatHandler) bindMessage(c *gin.Context) (chat.ProcessRequest, bool) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(401, gin.H{"error": "unauthorized"})
		return chat.ProcessRequest{}, false
	}
	var req chatMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return chat.ProcessRequest{}, false
	}
	date, err := chat.ParseDate(req.Date)
	if err != nil {
		workflowError(c, err)
		return chat.ProcessRequest{}, false
	}
	return chat.ProcessRequest{UserID: userID, SessionDate: date, Content: req.Content, RequestID: req.RequestID, Model: req.Model}, true
}

func (h *ChatHandler) SendMessage(c *gin.Context) {
	req, ok := h.bindMessage(c)
	if !ok {
		return
	}
	result, err := h.chatService.Process(c.Request.Context(), req)
	if err != nil {
		workflowError(c, err)
		return
	}
	c.JSON(200, result)
}

// StreamMessage answers with server-sent events. "delta" events carry reply
// text as it is generated, "done" carries the committed reply and workflow,
// and "error" reports a failure after streaming began. Failures before the
// first delta use the same JSON status codes as SendMessage.
func (h *ChatHandler) StreamMessage(c *gin.Context) {
	req, ok := h.bindMessage(c)
	if !ok {
		return
	}
	stream := &eventStream{c: c}
	result, err := h.chatService.ProcessStream(c.Request.Context(), req, func(text string) {
		stream.send("delta", gin.H{"text": text})
	})
	if err != nil {
		if !stream.started {
			workflowError(c, err)
			return
		}
		status, message := workflowStatus(err)
		stream.send("error", gin.H{"error": message, "status": status})
		return
	}
	stream.send("done", result)
}

type eventStream struct {
	c       *gin.Context
	started bool
}

func (s *eventStream) send(event string, payload any) {
	if !s.started {
		s.started = true
		header := s.c.Writer.Header()
		header.Set("Content-Type", "text/event-stream")
		header.Set("Cache-Control", "no-cache")
		header.Set("Connection", "keep-alive")
		header.Set("X-Accel-Buffering", "no")
		s.c.Status(http.StatusOK)
		s.c.Writer.WriteHeaderNow()
	}
	data, err := json.Marshal(payload)
	if err != nil {
		slog.Error("encode stream event", "event", event, "error", err)
		return
	}
	fmt.Fprintf(s.c.Writer, "event: %s\ndata: %s\n\n", event, data)
	s.c.Writer.Flush()
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
