-- name: ListChatMessagesByUserAndDate :many
SELECT * FROM chat_messages
WHERE user_id = $1 AND session_date = $2
ORDER BY created_at ASC;

-- name: ListChatSessionsByUser :many
WITH dates AS (
    SELECT plan_date AS session_date FROM daily_plans WHERE user_id = $1
    UNION
    SELECT session_date FROM chat_messages WHERE user_id = $1
)
SELECT
    dates.session_date,
    COALESCE(
        (ARRAY_AGG(m.content ORDER BY m.created_at) FILTER (WHERE m.role = 'user'))[1],
        'Daily plan'
    )::text AS title,
    COUNT(m.id) AS message_count,
    GREATEST(MAX(m.created_at), MAX(p.updated_at))::timestamptz AS updated_at
FROM dates
LEFT JOIN daily_plans p ON p.user_id = $1 AND p.plan_date = dates.session_date
LEFT JOIN chat_messages m ON m.user_id = $1 AND m.session_date = dates.session_date
GROUP BY dates.session_date
ORDER BY updated_at DESC
LIMIT 90;

-- name: CreateChatMessage :one
INSERT INTO chat_messages (user_id, session_date, role, content, created_at)
VALUES ($1, $2, $3, $4, clock_timestamp())
RETURNING *;

-- name: CountChatMessagesByUserAndDate :one
SELECT COUNT(*) FROM chat_messages
WHERE user_id = $1 AND session_date = $2;

-- name: DeleteChatMessagesByUserAndDate :exec
DELETE FROM chat_messages
WHERE user_id = $1 AND session_date = $2;
