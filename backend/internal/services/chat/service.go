package chat

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ashwinshanmugam/caprio/backend/internal/db"
	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/ashwinshanmugam/caprio/backend/internal/mastra"
)

type Agent interface {
	Chat(context.Context, mastra.Call) (*mastra.ChatResponse, error)
}
type Service struct {
	store  *db.Store
	agent  Agent
	signer turnSigner
	now    func() time.Time // nil means the system clock
}

type Option func(*Service)

// WithToolSecret signs turn tokens with the secret shared with the planner
// agent, so any backend replica can verify a tool callback.
func WithToolSecret(secret string) Option {
	return func(s *Service) { s.signer = newTurnSigner([]byte(secret)) }
}

func NewService(store *db.Store, agent Agent, opts ...Option) *Service {
	s := &Service{store: store, agent: agent, signer: newTurnSigner(nil)}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

type ProcessRequest struct {
	UserID      uuid.UUID
	SessionDate pgtype.Date
	Content     string
	RequestID   uuid.UUID
	Model       string
	TaskID      *uuid.UUID
}
type ProcessResponse struct {
	AppliedChange *ChangeReceipt `json:"appliedChange,omitempty"`
	Text          string         `json:"text"`
	Workflow      *Workflow      `json:"workflow"`
}

func ensureDay(ctx context.Context, tx pgx.Tx, userID uuid.UUID, date pgtype.Date) error {
	_, err := tx.Exec(ctx, `INSERT INTO daily_plans (user_id,plan_date) VALUES ($1,$2) ON CONFLICT DO NOTHING`, userID, date)
	return err
}

func load(ctx context.Context, conn generated.DBTX, userID uuid.UUID, date pgtype.Date) (*Workflow, error) {
	q := generated.New(conn)
	w := &Workflow{Date: date.Time.Format("2006-01-02"), State: "planning"}
	var draft, review, closedTasks []byte
	err := conn.QueryRow(ctx, `SELECT state,version,draft,review,closed_tasks,available_minutes FROM daily_plans WHERE user_id=$1 AND plan_date=$2`, userID, date).Scan(&w.State, &w.Version, &draft, &review, &closedTasks, &w.AvailableMinutes)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	if w.draft, err = decodeDraft(draft); err != nil {
		return nil, err
	}
	if len(review) > 0 {
		if err := json.Unmarshal(review, &w.Review); err != nil {
			return nil, err
		}
	}
	w.Tasks, err = q.ListTodayTasksByUser(ctx, generated.ListTodayTasksByUserParams{UserID: userID, PlannedForDate: date})
	if err != nil {
		return nil, err
	}
	w.TaskDetailsAvailable = true
	if w.State == "closed" {
		w.Tasks = []generated.Task{}
		w.TaskDetailsAvailable = len(closedTasks) > 0 && string(closedTasks) != "null"
		if w.TaskDetailsAvailable {
			if err := json.Unmarshal(closedTasks, &w.Tasks); err != nil {
				return nil, err
			}
		}
	}
	// Saved tasks do not confirm a plan. They can still require an explicit
	// closeout even when a legacy/manual/carry-only day has no plan row.
	err = conn.QueryRow(ctx, `
		WITH candidates AS (
			SELECT plan_date AS day FROM daily_plans
			WHERE user_id=$1 AND plan_date<$2 AND state='active'
			UNION
			SELECT planned_for_date AS day FROM tasks
			WHERE user_id=$1 AND planned_for_date<$2 AND status IN ('planned','completed')
		)
		SELECT min(c.day)::text FROM candidates c
		LEFT JOIN daily_plans p ON p.user_id=$1 AND p.plan_date=c.day
		WHERE p.state IS DISTINCT FROM 'closed'`, userID, date).Scan(&w.OldestUnclosedDate)
	if err != nil {
		return nil, err
	}
	w.Backlog, err = q.ListBacklogTasks(ctx, userID)
	if err != nil {
		return nil, err
	}
	w.Messages, err = q.ListChatMessagesByUserAndDate(ctx, generated.ListChatMessagesByUserAndDateParams{UserID: userID, SessionDate: date})
	if err != nil {
		return nil, err
	}
	if w.CarryoverOrigins, err = carryoverOrigins(ctx, conn, userID); err != nil {
		return nil, err
	}
	if !w.draft.empty() {
		owned, err := q.ListTasksByUser(ctx, userID)
		if err != nil {
			return nil, err
		}
		w.Plan = buildPlanView(draftEnv{Date: date, Owned: owned}, w.draft, w.CarryoverOrigins)
	}
	w.ChangeReceipts = []ChangeReceipt{}
	batches, err := readBatches(ctx, conn, userID, date)
	if err != nil {
		return nil, err
	}
	for _, batch := range batches {
		r, err := receipt(ctx, conn, userID, batch)
		if err != nil {
			return nil, err
		}
		w.ChangeReceipts = append(w.ChangeReceipts, r)
	}
	w.ReviewHistory = []ReviewRecord{}
	reviews, err := conn.Query(ctx, `SELECT id,created_at,review,closed_tasks FROM day_reviews WHERE user_id=$1 AND plan_date=$2 ORDER BY created_at,id`, userID, date)
	if err != nil {
		return nil, err
	}
	for reviews.Next() {
		var r ReviewRecord
		var createdAt time.Time
		var raw, tasks []byte
		if err := reviews.Scan(&r.ID, &createdAt, &raw, &tasks); err != nil {
			reviews.Close()
			return nil, err
		}
		r.CreatedAt = createdAt.UTC().Format(time.RFC3339Nano)
		if err := json.Unmarshal(raw, &r.Review); err != nil {
			reviews.Close()
			return nil, err
		}
		r.TaskDetailsAvailable = len(tasks) > 0 && string(tasks) != "null"
		if r.TaskDetailsAvailable {
			if err := json.Unmarshal(tasks, &r.Tasks); err != nil {
				reviews.Close()
				return nil, err
			}
		}
		w.ReviewHistory = append(w.ReviewHistory, r)
	}
	reviews.Close()
	if err := reviews.Err(); err != nil {
		return nil, err
	}
	// Active days open on the adjust prompt instead; closed days are archived.
	if len(w.Messages) == 0 && w.State == "planning" {
		w.Opener = openerText(date, LocalNow(ctx), w.Tasks, w.CarryoverOrigins)
	}
	return w, nil
}

func carryoverOrigins(ctx context.Context, conn generated.DBTX, userID uuid.UUID) (map[string]string, error) {
	origins := map[string]string{}
	rows, err := conn.Query(ctx, `SELECT c.task_id::text,c.first_planned_date::text FROM task_carryovers c JOIN tasks t ON t.id=c.task_id WHERE t.user_id=$1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, origin string
		if err := rows.Scan(&id, &origin); err != nil {
			return nil, err
		}
		origins[id] = origin
	}
	return origins, rows.Err()
}

func decodeDraft(raw []byte) (*Draft, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	var d Draft
	if err := json.Unmarshal(raw, &d); err != nil {
		return nil, err
	}
	if d.Entries == nil {
		d.Entries = map[string]*DraftEntry{}
	}
	return &d, nil
}

func (s *Service) Get(ctx context.Context, userID uuid.UUID, date pgtype.Date) (*Workflow, error) {
	ctx = withClock(ctx, s.now)
	tx, err := s.store.Pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	w, err := load(ctx, tx, userID, date)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return w, nil
}

// Confirm applies the day's draft. It is the only path from chat to saved
// tasks. A repeated confirm of the same draft returns the saved day.
func (s *Service) Confirm(ctx context.Context, userID uuid.UUID, date pgtype.Date, draftID uuid.UUID, version int32) (*Workflow, error) {
	ctx = withClock(ctx, s.now)
	var result *Workflow
	changed := false
	err := s.store.WithUserTx(ctx, userID, func(tx pgx.Tx, q *generated.Queries) error {
		w, err := load(ctx, tx, userID, date)
		if err != nil {
			return err
		}
		var confirmed *uuid.UUID
		var before *string
		err = tx.QueryRow(ctx, `SELECT confirmed_proposal_id,proposal_snapshot FROM daily_plans WHERE user_id=$1 AND plan_date=$2`, userID, date).Scan(&confirmed, &before)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrConflict
		}
		if err != nil {
			return err
		}
		if confirmed != nil && *confirmed == draftID {
			result = w
			return nil
		}
		if w.draft.empty() {
			if w.State == "closed" {
				return ErrClosed
			}
			return ErrConflict
		}
		owned, err := q.ListTasksByUser(ctx, userID)
		if err != nil {
			return err
		}
		if w.draft.ID != draftID || w.Version != version || before == nil || *before != snapshot(owned, nil) {
			return ErrConflict
		}
		if err := WritableDate(ctx, date); err != nil {
			return err
		}
		batch, err := applyOperations(ctx, tx, userID, date, draftID, w.draft.ToOperations())
		if err != nil {
			return err
		}
		// applyOperations already activated and versioned the days it changed;
		// bumping again would stop Undo from restoring their prior state.
		touched := false
		if batch != nil {
			_, touched = batch.Days[date.Time.Format("2006-01-02")]
		}
		if _, err := tx.Exec(ctx, `UPDATE daily_plans SET state=CASE WHEN $4 OR state='closed' THEN state ELSE 'active' END,draft=NULL,proposal_snapshot=NULL,confirmed_proposal_id=$3,version=version+CASE WHEN $4 THEN 0 ELSE 1 END,updated_at=clock_timestamp() WHERE user_id=$1 AND plan_date=$2`, userID, date, draftID, touched); err != nil {
			return err
		}
		if err := writePlanSaved(ctx, tx, q, userID, date); err != nil {
			return err
		}
		result, err = load(ctx, tx, userID, date)
		changed = err == nil
		return err
	})
	if err == nil && changed {
		logWorkflowEvent(ctx, "plan_confirmed", userID, result, len(result.Tasks), "proposal_id", draftID.String())
	}
	return result, err
}

// writePlanSaved marks a confirmation in the thread with the day's open count.
func writePlanSaved(ctx context.Context, tx pgx.Tx, q *generated.Queries, userID uuid.UUID, date pgtype.Date) error {
	var open int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM tasks WHERE user_id=$1 AND planned_for_date=$2 AND status='planned' AND NOT completed`, userID, date).Scan(&open); err != nil {
		return err
	}
	// The marker stays in this day's thread, so it names no relative day that
	// would go stale ("tomorrow" read the next morning).
	return writeEvent(ctx, q, userID, date, eventPlanSaved, "Plan saved · "+plural(open, "task"), nil)
}

// Discard clears the day's draft and marks it in the thread. Repeating a
// stale discard returns a conflict; it can never remove a newer draft.
func (s *Service) Discard(ctx context.Context, userID uuid.UUID, date pgtype.Date, draftID uuid.UUID, version int32) (*Workflow, error) {
	ctx = withClock(ctx, s.now)
	var result *Workflow
	err := s.store.WithUserTx(ctx, userID, func(tx pgx.Tx, q *generated.Queries) error {
		w, err := load(ctx, tx, userID, date)
		if err != nil {
			return err
		}
		if w.draft.empty() || w.draft.ID != draftID || w.Version != version {
			return ErrConflict
		}
		if _, err := tx.Exec(ctx, `UPDATE daily_plans SET draft=NULL,proposal_snapshot=NULL,version=version+1,updated_at=clock_timestamp() WHERE user_id=$1 AND plan_date=$2`, userID, date); err != nil {
			return err
		}
		if err := writeEvent(ctx, q, userID, date, eventDiscarded, "Proposal discarded", nil); err != nil {
			return err
		}
		result, err = load(ctx, tx, userID, date)
		return err
	})
	return result, err
}
