-- +goose Up
ALTER TABLE daily_plans ADD COLUMN conversation_title TEXT;
COMMENT ON COLUMN daily_plans.conversation_title IS 'Human-readable title generated from conversation context';

-- +goose Down
ALTER TABLE daily_plans DROP COLUMN IF EXISTS conversation_title;
