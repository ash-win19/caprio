-- +goose Up
CREATE TYPE urgency_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE task_source AS ENUM ('manual', 'voice', 'carried', 'standup');

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    urgency urgency_level NOT NULL DEFAULT 'medium',
    duration INT,
    source task_source NOT NULL DEFAULT 'manual',
    completed BOOLEAN NOT NULL DEFAULT false,
    added_today BOOLEAN NOT NULL DEFAULT true,
    carried_over BOOLEAN NOT NULL DEFAULT false,
    sort_order INT NOT NULL DEFAULT 0,
    due_date DATE,
    defer_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_user_date ON tasks(user_id, created_at);
CREATE INDEX idx_tasks_category_id ON tasks(category_id);

-- +goose Down
DROP TABLE IF EXISTS tasks;
DROP TYPE IF EXISTS task_source;
DROP TYPE IF EXISTS urgency_level;
