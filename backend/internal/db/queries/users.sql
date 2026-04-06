-- name: CreateUser :one
INSERT INTO users (email, name, password_hash)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1;

-- name: UpdateUserPrefs :one
UPDATE users SET
    brief_time = COALESCE(sqlc.narg(brief_time), brief_time),
    nudge_frequency = COALESCE(sqlc.narg(nudge_frequency), nudge_frequency),
    proactive_reprioritization = COALESCE(sqlc.narg(proactive_reprioritization), proactive_reprioritization),
    eod_reminder = COALESCE(sqlc.narg(eod_reminder), eod_reminder),
    eod_time = COALESCE(sqlc.narg(eod_time), eod_time),
    mic_sensitivity = COALESCE(sqlc.narg(mic_sensitivity), mic_sensitivity),
    language = COALESCE(sqlc.narg(language), language),
    save_transcripts = COALESCE(sqlc.narg(save_transcripts), save_transcripts),
    updated_at = now()
WHERE id = sqlc.arg(id)
RETURNING *;

-- name: UpdateLastStandupDate :exec
UPDATE users SET last_standup_date = $2, updated_at = now() WHERE id = $1;

-- name: UpdateStreak :exec
UPDATE users SET streak = $2, updated_at = now() WHERE id = $1;
