package db

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
)

type Store struct {
	Pool    *pgxpool.Pool
	Queries *generated.Queries
}

// WithUserTx serializes workflow mutations across API instances, including direct task edits.
func (s *Store) WithUserTx(ctx context.Context, userID uuid.UUID, fn func(pgx.Tx, *generated.Queries) error) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", userID.String()); err != nil {
		return err
	}
	if err := fn(tx, s.Queries.WithTx(tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{
		Pool:    pool,
		Queries: generated.New(pool),
	}
}
