-- name: ListTasksByUser :many
SELECT * FROM tasks
WHERE user_id = $1
ORDER BY sort_order ASC;

-- name: ListTodayTasksByUser :many
SELECT * FROM tasks
WHERE user_id = $1
    AND completed = false
    AND created_at >= CURRENT_DATE
ORDER BY sort_order ASC;

-- name: GetTaskByID :one
SELECT * FROM tasks WHERE id = $1 AND user_id = $2;

-- name: CreateTask :one
INSERT INTO tasks (user_id, title, description, category_id, urgency, duration, source, due_date, sort_order)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
    updated_at = now()
WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id)
RETURNING *;

-- name: ToggleTaskComplete :one
UPDATE tasks SET completed = NOT completed, updated_at = now()
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: DeferTask :one
UPDATE tasks SET
    carried_over = true,
    added_today = false,
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
WHERE user_id = $1 AND carried_over = true AND completed = false
ORDER BY sort_order ASC;
