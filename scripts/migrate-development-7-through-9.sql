-- Neon SQL Editor: Caprio / development / neondb.
-- Applies existing migrations 7 through 9 to the verified version-6 development schema.
-- Run the entire file. The preflight rejects already-migrated or partial schemas.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.goose_db_version IN EXCLUSIVE MODE;
SET LOCAL search_path = public;
DO $$
BEGIN
    IF (SELECT max(version_id) FROM goose_db_version WHERE is_applied) IS DISTINCT FROM 6::bigint
       OR to_regclass('public.chat_messages') IS NOT NULL
       OR to_regclass('public.daily_plans') IS NOT NULL
       OR to_regclass('public.chat_requests') IS NOT NULL
       OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='onboarding_complete') THEN
        RAISE EXCEPTION 'Expected the unmigrated version-6 development schema. Nothing applied.';
    END IF;
END $$;

-- Migration 7: 00007_add_chat_messages.sql
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_user_date ON chat_messages(user_id, session_date, created_at);


-- Migration 8: 00008_daily_workflow.sql
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


-- Migration 9: 00009_available_minutes.sql
-- Confirmed day capacity lives on the plan so Today can show remaining vs available
-- after the proposal draft is cleared.
ALTER TABLE daily_plans
    ADD COLUMN available_minutes INTEGER
    CHECK (available_minutes IS NULL OR (available_minutes >= 0 AND available_minutes <= 1440));


INSERT INTO goose_db_version (version_id, is_applied)
VALUES (7, true), (8, true), (9, true);
COMMIT;

-- Expected: three rows, all true.
SELECT version_id, is_applied FROM public.goose_db_version
WHERE version_id IN (7, 8, 9) ORDER BY version_id;
-- Expected: successful query, zero rows.
SELECT state, version, proposal, review, closed_tasks, available_minutes
FROM public.daily_plans LIMIT 0;
