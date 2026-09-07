-- +goose Up
-- Existing accounts have already passed the original client-side onboarding.
-- Backfill them as complete, then use false only for newly created accounts.
ALTER TABLE users ADD COLUMN onboarding_complete BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ALTER COLUMN onboarding_complete SET DEFAULT false;

CREATE TABLE daily_plans (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_date DATE NOT NULL,
    state TEXT NOT NULL DEFAULT 'planning' CHECK (state IN ('planning', 'active', 'closed')),
    version INTEGER NOT NULL DEFAULT 0,
    proposal JSONB,
    proposal_snapshot TEXT,
    confirmed_proposal_id UUID,
    review JSONB,
    closed_tasks JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, plan_date)
);

CREATE TABLE chat_requests (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_id UUID NOT NULL,
    session_date DATE NOT NULL,
    content TEXT NOT NULL,
    assistant_text TEXT NOT NULL,
    PRIMARY KEY (user_id, request_id)
);

-- Existing reviewed days must stay closed after rollout.
INSERT INTO daily_plans (user_id, plan_date, state, review)
SELECT user_id, session_date, 'closed', jsonb_build_object(
    'completedCount', tasks_completed,
    'carriedToTomorrowCount', 0,
    'droppedCount', 0,
    'notes', COALESCE(notes, ''),
    'energyLevel', energy_level
) FROM standup_sessions;

-- +goose Down
DROP TABLE IF EXISTS chat_requests;
DROP TABLE IF EXISTS daily_plans;
ALTER TABLE users DROP COLUMN IF EXISTS onboarding_complete;
