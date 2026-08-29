-- name: ListChatMessagesByUserAndDate :many
SELECT * FROM chat_messages
WHERE user_id = $1 AND session_date = $2
ORDER BY created_at ASC;

-- name: CreateChatMessage :one
INSERT INTO chat_messages (user_id, session_date, role, content)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: CountChatMessagesByUserAndDate :one
SELECT COUNT(*) FROM chat_messages
WHERE user_id = $1 AND session_date = $2;

-- name: DeleteChatMessagesByUserAndDate :exec
DELETE FROM chat_messages
WHERE user_id = $1 AND session_date = $2;
