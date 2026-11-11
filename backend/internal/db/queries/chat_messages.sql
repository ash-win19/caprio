-- name: ListChatMessagesByUserAndDate :many
SELECT * FROM chat_messages
WHERE user_id = $1 AND session_date = $2
ORDER BY created_at ASC;

-- name: CreateChatMessage :one
INSERT INTO chat_messages (user_id, session_date, role, content, created_at)
VALUES ($1, $2, $3, $4, clock_timestamp())
RETURNING *;

-- name: CreateChatEvent :one
INSERT INTO chat_messages (user_id, session_date, role, event_type, content, metadata, created_at)
VALUES ($1, $2, 'event', $3, $4, $5, clock_timestamp())
RETURNING *;
