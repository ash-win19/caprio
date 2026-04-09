-- +goose Up

-- New enum for task lifecycle status
CREATE TYPE task_status AS ENUM ('backlog', 'planned', 'completed', 'dropped');

-- Add day-based planning columns
ALTER TABLE tasks
    ADD COLUMN planned_for_date DATE,
    ADD COLUMN status task_status NOT NULL DEFAULT 'planned',
    ADD COLUMN priority_reason TEXT,
    ADD COLUMN completed_at TIMESTAMPTZ;

-- Backfill existing rows
UPDATE tasks SET
    status = CASE
        WHEN completed = true THEN 'completed'::task_status
        WHEN carried_over = true THEN 'backlog'::task_status
        ELSE 'planned'::task_status
    END,
    planned_for_date = COALESCE(due_date, created_at::date),
    completed_at = CASE
        WHEN completed = true THEN updated_at
        ELSE NULL
    END;

-- Make planned_for_date NOT NULL after backfill
ALTER TABLE tasks ALTER COLUMN planned_for_date SET NOT NULL;

-- Index optimized for day-based task list queries
CREATE INDEX idx_tasks_user_day_status ON tasks(user_id, planned_for_date, status);

-- +goose Down
DROP INDEX IF EXISTS idx_tasks_user_day_status;
ALTER TABLE tasks
    DROP COLUMN IF EXISTS completed_at,
    DROP COLUMN IF EXISTS priority_reason,
    DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS planned_for_date;
DROP TYPE IF EXISTS task_status;
