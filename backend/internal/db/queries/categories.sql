-- name: ListCategoriesByUser :many
SELECT * FROM categories WHERE user_id = $1 ORDER BY sort_order ASC;
