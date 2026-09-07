package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/ashwinshanmugam/caprio/backend/internal/db"
	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/ashwinshanmugam/caprio/backend/internal/http/middleware"
	"github.com/ashwinshanmugam/caprio/backend/internal/services/chat"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type TaskHandler struct{ store *db.Store }

func NewTaskHandler(store *db.Store) *TaskHandler { return &TaskHandler{store: store} }
func todayDate() pgtype.Date {
	return pgtype.Date{Time: time.Now().UTC().Truncate(24 * time.Hour), Valid: true}
}
func badTask(message string) error { return &chat.ValidationError{Message: message} }

func dayIsOpen(ctx context.Context, tx pgx.Tx, userID uuid.UUID, date pgtype.Date) error {
	var closed bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM daily_plans WHERE user_id=$1 AND plan_date=$2 AND state='closed')`, userID, date).Scan(&closed); err != nil {
		return err
	}
	if closed {
		return chat.ErrClosed
	}
	return nil
}
func categoryOwned(ctx context.Context, tx pgx.Tx, userID uuid.UUID, id *uuid.UUID) error {
	if id == nil {
		return nil
	}
	var owned bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM categories WHERE id=$1 AND user_id=$2)`, *id, userID).Scan(&owned); err != nil {
		return err
	}
	if !owned {
		return badTask("category does not belong to this account")
	}
	return nil
}
func (h *TaskHandler) List(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(401, gin.H{"error": "unauthorized"})
		return
	}
	var tasks []generated.Task
	var err error
	if c.Query("status") == "backlog" {
		tasks, err = h.store.Queries.ListBacklogTasks(c.Request.Context(), userID)
	} else {
		var date pgtype.Date
		date, err = queryDate(c)
		if err == nil {
			tasks, err = h.store.Queries.ListTodayTasksByUser(c.Request.Context(), generated.ListTodayTasksByUserParams{UserID: userID, PlannedForDate: date})
		}
	}
	if err != nil {
		workflowError(c, err)
		return
	}
	c.JSON(200, gin.H{"tasks": tasks})
}

type createTaskRequest struct {
	Title          string     `json:"title" binding:"required"`
	Description    *string    `json:"description"`
	CategoryID     *uuid.UUID `json:"categoryId"`
	Urgency        string     `json:"urgency"`
	Duration       *int32     `json:"duration"`
	Source         string     `json:"source"`
	DueDate        *string    `json:"dueDate"`
	PlannedForDate *string    `json:"plannedForDate"`
	SortOrder      int32      `json:"sortOrder"`
	Status         string     `json:"status"`
	PriorityReason *string    `json:"priorityReason"`
}

func validateTaskFields(title string, duration *int32, urgency, status string) error {
	if strings.TrimSpace(title) == "" || len(title) > 500 {
		return badTask("title must contain 1 to 500 characters")
	}
	if duration != nil && (*duration < 1 || *duration > 1440) {
		return badTask("duration must be between 1 and 1440 minutes")
	}
	if !generated.UrgencyLevel(urgency).Valid() || !generated.TaskStatus(status).Valid() {
		return badTask("invalid task urgency or status")
	}
	return nil
}
func (h *TaskHandler) Create(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(401, gin.H{"error": "unauthorized"})
		return
	}
	var req createTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Urgency == "" {
		req.Urgency = "medium"
	}
	if req.Status == "" {
		req.Status = "planned"
	}
	if req.Source == "" {
		req.Source = "manual"
	}
	if err := validateTaskFields(req.Title, req.Duration, req.Urgency, req.Status); err != nil {
		workflowError(c, err)
		return
	}
	if !generated.TaskSource(req.Source).Valid() {
		c.JSON(400, gin.H{"error": "invalid task source"})
		return
	}
	date := todayDate()
	var due pgtype.Date
	var err error
	if req.PlannedForDate != nil {
		date, err = chat.ParseDate(*req.PlannedForDate)
	}
	if err == nil && req.DueDate != nil {
		due, err = chat.ParseDate(*req.DueDate)
	}
	if err != nil {
		workflowError(c, err)
		return
	}
	ctx := c.Request.Context()
	var task generated.Task
	err = h.mutate(ctx, userID, func(tx pgx.Tx, q *generated.Queries) error {
		if req.Status != "backlog" {
			if err := dayIsOpen(ctx, tx, userID, date); err != nil {
				return err
			}
		}
		if err := categoryOwned(ctx, tx, userID, req.CategoryID); err != nil {
			return err
		}
		var err error
		task, err = q.CreateTask(ctx, generated.CreateTaskParams{UserID: userID, Title: req.Title, Description: req.Description, CategoryID: req.CategoryID, Urgency: generated.UrgencyLevel(req.Urgency), Duration: req.Duration, Source: generated.TaskSource(req.Source), DueDate: due, SortOrder: req.SortOrder, PlannedForDate: date, Status: generated.TaskStatus(req.Status), PriorityReason: req.PriorityReason})
		if err != nil {
			return err
		}
		if req.Status == "completed" {
			if err = q.CloseTaskDone(ctx, generated.CloseTaskDoneParams{ID: task.ID, UserID: userID}); err != nil {
				return err
			}
			task, err = q.GetTaskByID(ctx, generated.GetTaskByIDParams{ID: task.ID, UserID: userID})
		}
		return err
	})
	if err != nil {
		workflowError(c, err)
		return
	}
	c.JSON(http.StatusCreated, task)
}

type updateTaskRequest struct {
	Title          *string    `json:"title"`
	Description    *string    `json:"description"`
	CategoryID     *uuid.UUID `json:"categoryId"`
	Urgency        *string    `json:"urgency"`
	Duration       *int32     `json:"duration"`
	Completed      *bool      `json:"completed"`
	SortOrder      *int32     `json:"sortOrder"`
	DueDate        *string    `json:"dueDate"`
	PlannedForDate *string    `json:"plannedForDate"`
	Status         *string    `json:"status"`
	PriorityReason *string    `json:"priorityReason"`
}

func (h *TaskHandler) Update(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(401, gin.H{"error": "unauthorized"})
		return
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid task id"})
		return
	}
	var req updateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	ctx := c.Request.Context()
	var task generated.Task
	err = h.mutate(ctx, userID, func(tx pgx.Tx, q *generated.Queries) error {
		current, err := q.GetTaskByID(ctx, generated.GetTaskByIDParams{ID: id, UserID: userID})
		if err != nil {
			return err
		}
		if current.Status != generated.TaskStatusBacklog {
			if err := dayIsOpen(ctx, tx, userID, current.PlannedForDate); err != nil {
				return err
			}
		}
		if err := categoryOwned(ctx, tx, userID, req.CategoryID); err != nil {
			return err
		}
		title := current.Title
		if req.Title != nil {
			title = strings.TrimSpace(*req.Title)
			req.Title = &title
		}
		duration := current.Duration
		if req.Duration != nil {
			duration = req.Duration
		}
		urgency := string(current.Urgency)
		if req.Urgency != nil {
			urgency = *req.Urgency
		}
		status := string(current.Status)
		if req.Status != nil {
			status = *req.Status
		}
		if req.Completed != nil {
			if req.Status != nil && (*req.Completed != (status == "completed")) {
				return badTask("completed and status disagree")
			}
			if *req.Completed {
				status = "completed"
			} else if status == "completed" {
				status = "planned"
			}
		}
		if err := validateTaskFields(title, duration, urgency, status); err != nil {
			return err
		}
		date := current.PlannedForDate
		var due pgtype.Date
		if req.PlannedForDate != nil {
			date, err = chat.ParseDate(*req.PlannedForDate)
			if err != nil {
				return err
			}
		}
		if status != "backlog" {
			if err := dayIsOpen(ctx, tx, userID, date); err != nil {
				return err
			}
		}
		if req.DueDate != nil {
			due, err = chat.ParseDate(*req.DueDate)
			if err != nil {
				return err
			}
		}
		completed := status == "completed"
		task, err = q.UpdateTask(ctx, generated.UpdateTaskParams{ID: id, UserID: userID, Title: req.Title, Description: req.Description, CategoryID: req.CategoryID, Urgency: generated.NullUrgencyLevel{UrgencyLevel: generated.UrgencyLevel(urgency), Valid: true}, Duration: req.Duration, Completed: &completed, SortOrder: req.SortOrder, DueDate: due, PlannedForDate: date, Status: generated.NullTaskStatus{TaskStatus: generated.TaskStatus(status), Valid: true}, PriorityReason: req.PriorityReason})
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE tasks SET completed_at=CASE WHEN completed THEN COALESCE(completed_at,clock_timestamp()) ELSE NULL END,updated_at=clock_timestamp() WHERE id=$1 AND user_id=$2`, id, userID)
		if err != nil {
			return err
		}
		task, err = q.GetTaskByID(ctx, generated.GetTaskByIDParams{ID: id, UserID: userID})
		return err
	})
	if err != nil {
		workflowError(c, err)
		return
	}
	c.JSON(200, task)
}
func (h *TaskHandler) Delete(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(401, gin.H{"error": "unauthorized"})
		return
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid task id"})
		return
	}
	ctx := c.Request.Context()
	err = h.mutate(ctx, userID, func(tx pgx.Tx, q *generated.Queries) error {
		task, err := q.GetTaskByID(ctx, generated.GetTaskByIDParams{ID: id, UserID: userID})
		if err != nil {
			return err
		}
		if task.Status != generated.TaskStatusBacklog {
			if err := dayIsOpen(ctx, tx, userID, task.PlannedForDate); err != nil {
				return err
			}
		}
		return q.DeleteTask(ctx, generated.DeleteTaskParams{ID: id, UserID: userID})
	})
	if err != nil {
		workflowError(c, err)
		return
	}
	c.JSON(200, gin.H{"deleted": true})
}

type reorderRequest struct {
	Tasks []reorderItem `json:"tasks" binding:"required"`
}
type reorderItem struct {
	ID        uuid.UUID `json:"id"`
	SortOrder int32     `json:"sortOrder"`
}

func (h *TaskHandler) Reorder(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(401, gin.H{"error": "unauthorized"})
		return
	}
	var req reorderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	ctx := c.Request.Context()
	err := h.mutate(ctx, userID, func(tx pgx.Tx, q *generated.Queries) error {
		seen := map[uuid.UUID]bool{}
		for _, item := range req.Tasks {
			if seen[item.ID] || item.SortOrder < 0 {
				return badTask("invalid task order")
			}
			seen[item.ID] = true
			task, err := q.GetTaskByID(ctx, generated.GetTaskByIDParams{ID: item.ID, UserID: userID})
			if err != nil {
				return err
			}
			if task.Status != generated.TaskStatusBacklog {
				if err := dayIsOpen(ctx, tx, userID, task.PlannedForDate); err != nil {
					return err
				}
			}
			if err := q.UpdateTaskSortOrder(ctx, generated.UpdateTaskSortOrderParams{ID: item.ID, UserID: userID, SortOrder: item.SortOrder}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		workflowError(c, err)
		return
	}
	c.JSON(200, gin.H{"reordered": true})
}
func (h *TaskHandler) Defer(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(401, gin.H{"error": "unauthorized"})
		return
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid task id"})
		return
	}
	ctx := c.Request.Context()
	var task generated.Task
	err = h.mutate(ctx, userID, func(tx pgx.Tx, q *generated.Queries) error {
		var err error
		task, err = q.GetTaskByID(ctx, generated.GetTaskByIDParams{ID: id, UserID: userID})
		if err != nil {
			return err
		}
		if task.Status == generated.TaskStatusBacklog {
			return nil
		}
		if task.Completed {
			return badTask("completed tasks cannot be deferred")
		}
		if err := dayIsOpen(ctx, tx, userID, task.PlannedForDate); err != nil {
			return err
		}
		task, err = q.DeferTask(ctx, generated.DeferTaskParams{ID: id, UserID: userID})
		return err
	})
	if err != nil {
		workflowError(c, err)
		return
	}
	c.JSON(200, task)
}

// Any direct task edit invalidates pending AI proposals, including proposals on
// another day that may reference an inbox task. Saved tasks remain authoritative.
func (h *TaskHandler) mutate(ctx context.Context, userID uuid.UUID, fn func(pgx.Tx, *generated.Queries) error) error {
	return h.store.WithUserTx(ctx, userID, func(tx pgx.Tx, q *generated.Queries) error {
		if err := fn(tx, q); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `UPDATE daily_plans SET proposal=NULL,proposal_snapshot=NULL,version=version+1,updated_at=clock_timestamp() WHERE user_id=$1 AND state <> 'closed' AND proposal IS NOT NULL`, userID)
		return err
	})
}
