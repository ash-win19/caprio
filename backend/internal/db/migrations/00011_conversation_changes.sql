-- +goose Up
CREATE TABLE task_change_batches (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_id UUID NOT NULL,
    conversation_date DATE NOT NULL,
    changes JSONB NOT NULL,
    day_states JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    undone_at TIMESTAMPTZ,
    UNIQUE(user_id, request_id)
);
CREATE INDEX task_change_batches_day ON task_change_batches(user_id, conversation_date, created_at);

CREATE TABLE day_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_date DATE NOT NULL,
    review JSONB NOT NULL,
    closed_tasks JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX day_reviews_day ON day_reviews(user_id, plan_date, created_at);
INSERT INTO day_reviews(user_id, plan_date, review, closed_tasks, created_at)
SELECT user_id, plan_date, review, closed_tasks, updated_at FROM daily_plans WHERE review IS NOT NULL;

-- +goose Down
DROP TABLE day_reviews;
DROP TABLE task_change_batches;
