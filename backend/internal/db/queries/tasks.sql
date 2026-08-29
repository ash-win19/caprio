-- name: ListTasksByUser :many
SELECT * FROM tasks
WHERE user_id = $1
ORDER BY sort_order ASC;

-- name: ListTodayTasksByUser :many
SELECT * FROM tasks
WHERE user_id = $1
    AND planned_for_date = $2
    AND status = 'planned'
ORDER BY sort_order ASC;

-- name: ListBacklogTasks :many
SELECT * FROM tasks
WHERE user_id = $1
    AND status = 'backlog'
ORDER BY sort_order ASC;

-- name: ListCompletedTasksByDate :many
SELECT * FROM tasks
WHERE user_id = $1
    AND planned_for_date = $2
    AND status = 'completed'
ORDER BY completed_at ASC;

-- name: GetTaskByID :one
SELECT * FROM tasks WHERE id = $1 AND user_id = $2;

-- name: CreateTask :one
INSERT INTO tasks (
    user_id, title, description, category_id, urgency, duration,
    source, due_date, sort_order, planned_for_date, status, priority_reason
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
RETURNING *;

-- name: UpdateTask :one
UPDATE tasks SET
    title = COALESCE(sqlc.narg(title), title),
    description = COALESCE(sqlc.narg(description), description),
    category_id = COALESCE(sqlc.narg(category_id), category_id),
    urgency = COALESCE(sqlc.narg(urgency), urgency),
    duration = COALESCE(sqlc.narg(duration), duration),
    completed = COALESCE(sqlc.narg(completed), completed),
    sort_order = COALESCE(sqlc.narg(sort_order), sort_order),
    due_date = COALESCE(sqlc.narg(due_date), due_date),
    planned_for_date = COALESCE(sqlc.narg(planned_for_date), planned_for_date),
    status = COALESCE(sqlc.narg(status), status),
    priority_reason = COALESCE(sqlc.narg(priority_reason), priority_reason),
    completed_at = COALESCE(sqlc.narg(completed_at), completed_at),
    updated_at = now()
WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id)
RETURNING *;

-- name: ToggleTaskComplete :one
UPDATE tasks SET
    completed = NOT completed,
    status = CASE WHEN completed = false THEN 'completed'::task_status ELSE 'planned'::task_status END,
    completed_at = CASE WHEN completed = false THEN now() ELSE NULL END,
    updated_at = now()
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: DeferTask :one
UPDATE tasks SET
    carried_over = true,
    added_today = false,
    status = 'backlog'::task_status,
    defer_count = defer_count + 1,
    updated_at = now()
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: DeleteTask :exec
DELETE FROM tasks WHERE id = $1 AND user_id = $2;

-- name: UpdateTaskSortOrder :exec
UPDATE tasks SET sort_order = $3, updated_at = now()
WHERE id = $1 AND user_id = $2;

-- name: ListCarriedOverTasks :many
SELECT * FROM tasks
WHERE user_id = $1
    AND status = 'backlog'
    AND completed = false
ORDER BY sort_order ASC;

-- name: CarryOverTasks :exec
UPDATE tasks SET
    planned_for_date = $2,
    status = 'planned'::task_status,
    carried_over = true,
    added_today = false,
    source = 'carried'::task_source,
    updated_at = now()
WHERE user_id = $1
    AND status = 'planned'
    AND planned_for_date < $2;

-- name: ListAllTasksByUserAndDate :many
SELECT * FROM tasks
WHERE user_id = $1
    AND planned_for_date = $2
ORDER BY sort_order ASC;

-- name: CloseTaskDone :exec
UPDATE tasks SET
    completed = true,
    status = 'completed'::task_status,
    completed_at = now(),
    updated_at = now()
WHERE id = $1 AND user_id = $2;

-- name: CloseTaskTomorrow :exec
UPDATE tasks SET
    planned_for_date = $3,
    status = 'planned'::task_status,
    carried_over = true,
    source = 'carried'::task_source,
    defer_count = defer_count + 1,
    updated_at = now()
WHERE id = $1 AND user_id = $2;

-- name: CloseTaskDrop :exec
UPDATE tasks SET
    status = 'dropped'::task_status,
    updated_at = now()
WHERE id = $1 AND user_id = $2;

-- name: ListYesterdayLeftovers :many
SELECT * FROM tasks
WHERE user_id = $1
    AND planned_for_date = $2
    AND status = 'planned'
    AND completed = false
ORDER BY sort_order ASC;

-- name: MarkTaskAsLeftover :exec
UPDATE tasks SET
    carried_over = true,
    source = 'carried'::task_source,
    updated_at = now()
WHERE id = $1 AND user_id = $2;
