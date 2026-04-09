package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ashwinshanmugam/caprio/backend/internal/db"
	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/ashwinshanmugam/caprio/backend/internal/http/middleware"
)

// TaskHandler handles all task-related HTTP endpoints.
type TaskHandler struct {
	store *db.Store
}

// NewTaskHandler creates a new TaskHandler with the given store.
func NewTaskHandler(store *db.Store) *TaskHandler {
	return &TaskHandler{store: store}
}

// todayDate returns a pgtype.Date set to today at midnight.
func todayDate() pgtype.Date {
	return pgtype.Date{
		Time:  time.Now().Truncate(24 * time.Hour),
		Valid: true,
	}
}

// List returns all planned tasks for the current user for today.
func (h *TaskHandler) List(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	tasks, err := h.store.Queries.ListTodayTasksByUser(c.Request.Context(), generated.ListTodayTasksByUserParams{
		UserID:         userID,
		PlannedForDate: todayDate(),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"tasks": tasks})
}

// createTaskRequest is the JSON body for creating a task.
type createTaskRequest struct {
	Title          string     `json:"title" binding:"required"`
	Description    *string    `json:"description"`
	CategoryID     *uuid.UUID `json:"categoryId"`
	Urgency        string     `json:"urgency"`
	Duration       *int32     `json:"duration"`
	Source         string     `json:"source"`
	DueDate        *string    `json:"dueDate"`
	SortOrder      int32      `json:"sortOrder"`
	Status         string     `json:"status"`
	PriorityReason *string    `json:"priorityReason"`
}

// Create adds a new task for the current user.
func (h *TaskHandler) Create(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req createTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Apply defaults for optional enum fields.
	if req.Urgency == "" {
		req.Urgency = "medium"
	}
	if req.Source == "" {
		req.Source = "manual"
	}
	if req.Status == "" {
		req.Status = "planned"
	}

	// Parse optional due date.
	var dueDate pgtype.Date
	if req.DueDate != nil {
		t, err := time.Parse("2006-01-02", *req.DueDate)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		dueDate = pgtype.Date{Time: t, Valid: true}
	}

	task, err := h.store.Queries.CreateTask(c.Request.Context(), generated.CreateTaskParams{
		UserID:         userID,
		Title:          req.Title,
		Description:    req.Description,
		CategoryID:     req.CategoryID,
		Urgency:        generated.UrgencyLevel(req.Urgency),
		Duration:       req.Duration,
		Source:         generated.TaskSource(req.Source),
		DueDate:        dueDate,
		SortOrder:      req.SortOrder,
		PlannedForDate: todayDate(),
		Status:         generated.TaskStatus(req.Status),
		PriorityReason: req.PriorityReason,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	c.JSON(http.StatusCreated, task)
}

// updateTaskRequest is the JSON body for partially updating a task.
type updateTaskRequest struct {
	Title          *string    `json:"title"`
	Description    *string    `json:"description"`
	CategoryID     *uuid.UUID `json:"categoryId"`
	Urgency        *string    `json:"urgency"`
	Duration       *int32     `json:"duration"`
	Completed      *bool      `json:"completed"`
	SortOrder      *int32     `json:"sortOrder"`
	DueDate        *string    `json:"dueDate"`
	Status         *string    `json:"status"`
	PriorityReason *string    `json:"priorityReason"`
}

// Update partially updates a task by ID.
func (h *TaskHandler) Update(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid task id"})
		return
	}

	var req updateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Map nullable enum fields.
	var urgency generated.NullUrgencyLevel
	if req.Urgency != nil {
		urgency = generated.NullUrgencyLevel{
			UrgencyLevel: generated.UrgencyLevel(*req.Urgency),
			Valid:        true,
		}
	}

	var status generated.NullTaskStatus
	if req.Status != nil {
		status = generated.NullTaskStatus{
			TaskStatus: generated.TaskStatus(*req.Status),
			Valid:      true,
		}
	}

	// Parse optional due date.
	var dueDate pgtype.Date
	if req.DueDate != nil {
		t, err := time.Parse("2006-01-02", *req.DueDate)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		dueDate = pgtype.Date{Time: t, Valid: true}
	}

	task, err := h.store.Queries.UpdateTask(c.Request.Context(), generated.UpdateTaskParams{
		Title:          req.Title,
		Description:    req.Description,
		CategoryID:     req.CategoryID,
		Urgency:        urgency,
		Duration:       req.Duration,
		Completed:      req.Completed,
		SortOrder:      req.SortOrder,
		DueDate:        dueDate,
		Status:         status,
		PriorityReason: req.PriorityReason,
		ID:             id,
		UserID:         userID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	c.JSON(http.StatusOK, task)
}

// Delete removes a task by ID.
func (h *TaskHandler) Delete(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid task id"})
		return
	}

	if err := h.store.Queries.DeleteTask(c.Request.Context(), generated.DeleteTaskParams{
		ID:     id,
		UserID: userID,
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

// reorderRequest is the JSON body for reordering tasks.
type reorderRequest struct {
	Tasks []reorderItem `json:"tasks" binding:"required"`
}

// reorderItem represents a single task's new sort order.
type reorderItem struct {
	ID        uuid.UUID `json:"id"`
	SortOrder int32     `json:"sortOrder"`
}

// Reorder updates the sort order of multiple tasks in a single transaction.
func (h *TaskHandler) Reorder(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req reorderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := h.store.WithTx(c.Request.Context(), func(q *generated.Queries) error {
		for _, item := range req.Tasks {
			if err := q.UpdateTaskSortOrder(c.Request.Context(), generated.UpdateTaskSortOrderParams{
				ID:        item.ID,
				UserID:    userID,
				SortOrder: item.SortOrder,
			}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"reordered": true})
}

// Defer defers a task by ID, incrementing its defer count and marking it as backlog.
func (h *TaskHandler) Defer(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid task id"})
		return
	}

	task, err := h.store.Queries.DeferTask(c.Request.Context(), generated.DeferTaskParams{
		ID:     id,
		UserID: userID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	c.JSON(http.StatusOK, task)
}
