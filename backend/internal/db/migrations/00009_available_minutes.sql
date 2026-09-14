-- +goose Up
-- Confirmed day capacity lives on the plan so Today can show remaining vs available
-- after the proposal draft is cleared.
ALTER TABLE daily_plans
    ADD COLUMN available_minutes INTEGER
    CHECK (available_minutes IS NULL OR (available_minutes >= 0 AND available_minutes <= 1440));

-- +goose Down
ALTER TABLE daily_plans DROP COLUMN IF EXISTS available_minutes;
