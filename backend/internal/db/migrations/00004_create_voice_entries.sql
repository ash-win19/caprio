-- +goose Up
CREATE TABLE voice_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transcript TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_voice_entries_user_id ON voice_entries(user_id);

-- +goose Down
DROP TABLE IF EXISTS voice_entries;
