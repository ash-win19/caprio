-- name: ListChatMessagesByUserAndDate :many
SELECT * FROM chat_messages
WHERE user_id = $1 AND session_date = $2
ORDER BY created_at ASC;

-- name: ListChatSessionsByUser :many
SELECT
    session_date,
    COALESCE(
        (ARRAY_AGG(content ORDER BY created_at) FILTER (WHERE role = 'user'))[1],
        'Untitled conversation'
    )::text AS title,
    COUNT(*) AS message_count,
    MAX(created_at)::timestamptz AS updated_at
FROM chat_messages
WHERE user_id = $1
GROUP BY session_date
ORDER BY updated_at DESC
LIMIT 30;

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
