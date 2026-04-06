-- name: CreateVoiceEntry :one
INSERT INTO voice_entries (user_id, transcript)
VALUES ($1, $2)
RETURNING *;

-- name: ListVoiceEntriesByUser :many
SELECT * FROM voice_entries
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;
