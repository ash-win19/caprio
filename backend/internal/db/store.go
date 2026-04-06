package db

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
)

type Store struct {
	Pool    *pgxpool.Pool
	Queries *generated.Queries
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{
		Pool:    pool,
		Queries: generated.New(pool),
	}
}

func (s *Store) WithTx(ctx context.Context, fn func(*generated.Queries) error) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	qtx := s.Queries.WithTx(tx)
	if err := fn(qtx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// SeedDefaultCategories creates the default set of categories for a new user.
func (s *Store) SeedDefaultCategories(ctx context.Context, userID uuid.UUID) error {
	type cat struct {
		Name  string
		Color string
	}
	defaults := []cat{
		{"Work", "#4A7CFF"},
		{"Gym", "#F97316"},
		{"Personal Growth", "#A855F7"},
		{"Health", "#EF4444"},
		{"Finance", "#EAB308"},
		{"Social", "#EC4899"},
		{"Learning", "#06B6D4"},
		{"Family", "#84CC16"},
	}

	return s.WithTx(ctx, func(q *generated.Queries) error {
		for i, c := range defaults {
			_, err := q.CreateCategory(ctx, generated.CreateCategoryParams{
				UserID:    userID,
				Name:      c.Name,
				Color:     c.Color,
				SortOrder: int32(i),
			})
			if err != nil {
				return err
			}
		}
		return nil
	})
}
