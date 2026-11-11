-- name: GetStandupByUserAndDate :one
SELECT * FROM standup_sessions
WHERE user_id = $1 AND session_date = $2;
