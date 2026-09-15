package chat

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
)

// Call only after a fresh transition commits. These logs are best effort;
// idempotent retries do not re-emit, but delivery is not a durable outbox.
func logWorkflowEvent(ctx context.Context, event string, userID uuid.UUID, workflow *Workflow, count int, extra ...any) {
	attrs := []any{"event", event, "user_id", userID.String(), "plan_date", workflow.Date,
		"workflow_version", workflow.Version, "task_count", count}
	slog.InfoContext(ctx, "workflow transition", append(attrs, extra...)...)
}
