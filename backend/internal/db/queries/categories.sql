-- name: ListCategoriesByUser :many
SELECT * FROM categories WHERE user_id = $1 ORDER BY sort_order ASC;

-- name: CreateCategory :one
INSERT INTO categories (user_id, name, color, hours_per_week, sort_order)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: UpdateCategory :one
UPDATE categories SET
    name = COALESCE(sqlc.narg(name), name),
    color = COALESCE(sqlc.narg(color), color),
    hours_per_week = COALESCE(sqlc.narg(hours_per_week), hours_per_week),
    sort_order = COALESCE(sqlc.narg(sort_order), sort_order)
WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id)
RETURNING *;

-- name: DeleteCategory :exec
DELETE FROM categories WHERE id = $1 AND user_id = $2;

-- name: BatchUpdateCategoryOrder :exec
UPDATE categories SET sort_order = $3 WHERE id = $1 AND user_id = $2;
