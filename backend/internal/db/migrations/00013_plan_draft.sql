-- +goose Up
-- The day's scratchpad draft. The planner's tools edit draft_staged while a
-- turn runs; the turn's commit promotes it to draft. turn_request_id marks the
-- one turn in progress for the day.
ALTER TABLE daily_plans ADD COLUMN draft JSONB;
ALTER TABLE daily_plans ADD COLUMN draft_staged JSONB;
ALTER TABLE daily_plans ADD COLUMN turn_request_id UUID;
ALTER TABLE daily_plans ADD COLUMN turn_started_at TIMESTAMPTZ;
-- Earlier operation-only proposals are not carried into the new draft format.
UPDATE daily_plans SET proposal = NULL, proposal_snapshot = NULL WHERE proposal IS NOT NULL;

-- +goose Down
ALTER TABLE daily_plans DROP COLUMN turn_started_at;
ALTER TABLE daily_plans DROP COLUMN turn_request_id;
ALTER TABLE daily_plans DROP COLUMN draft_staged;
ALTER TABLE daily_plans DROP COLUMN draft;
