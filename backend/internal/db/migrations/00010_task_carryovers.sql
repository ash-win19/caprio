-- +goose Up
-- Keep the first planned date when the same task moves through several days.
CREATE TABLE task_carryovers (
    task_id UUID PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    first_planned_date DATE NOT NULL
);

INSERT INTO task_carryovers (task_id, first_planned_date)
SELECT t.id, COALESCE(min(p.plan_date), t.planned_for_date)
FROM tasks t
LEFT JOIN daily_plans p ON p.user_id=t.user_id
    AND p.closed_tasks @> jsonb_build_array(jsonb_build_object('id', t.id::text))
WHERE t.carried_over=true
GROUP BY t.id, t.planned_for_date;

-- +goose Down
DROP TABLE task_carryovers;
