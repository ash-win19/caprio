-- +goose Up
CREATE TABLE standup_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    energy_level INT,
    notes TEXT,
    tasks_planned INT NOT NULL DEFAULT 0,
    tasks_completed INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, session_date)
);

CREATE INDEX idx_standup_sessions_user_date ON standup_sessions(user_id, session_date);

-- +goose Down
DROP TABLE IF EXISTS standup_sessions;
