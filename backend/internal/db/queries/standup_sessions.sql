-- name: GetStandupByUserAndDate :one
SELECT * FROM standup_sessions
WHERE user_id = $1 AND session_date = $2;

-- name: CreateStandupSession :one
INSERT INTO standup_sessions (user_id, session_date, energy_level, notes, tasks_planned)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: UpdateStandupSession :one
UPDATE standup_sessions SET
    energy_level = COALESCE(sqlc.narg(energy_level), energy_level),
    notes = COALESCE(sqlc.narg(notes), notes),
    tasks_planned = COALESCE(sqlc.narg(tasks_planned), tasks_planned),
    tasks_completed = COALESCE(sqlc.narg(tasks_completed), tasks_completed)
WHERE id = sqlc.arg(id)
RETURNING *;
