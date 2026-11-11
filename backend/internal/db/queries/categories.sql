-- name: ListCategoriesByUser :many
SELECT * FROM categories WHERE user_id = $1 ORDER BY sort_order ASC;

-- name: CreateCategory :one
INSERT INTO categories (user_id, name, color, hours_per_week, sort_order)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;
