// Package db owns PostgreSQL access: the connection pool, migrations and
// tenant-scoped transactions. Only service packages may use it (backend-go
// rule §1: handlers never touch the database).
package db

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Open creates a pool. Simple protocol is used so the app works behind
// PgBouncer in transaction mode (backend-go rule §10).
func Open(ctx context.Context, url string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("db: parse url: %w", err)
	}
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("db: connect: %w", err)
	}
	return pool, nil
}

// Tenant identifies who is acting and in which workspace.
type Tenant struct {
	WorkspaceID string
	UserID      string
}

var ErrNoTenant = errors.New("db: tenant workspace and user are required")

// WithTenant runs fn in a transaction whose row-level-security context is
// set to the tenant (transaction-local, so it is safe with pooled
// connections). All workspace-scoped queries must go through this.
func WithTenant(ctx context.Context, pool *pgxpool.Pool, t Tenant, fn func(pgx.Tx) error) error {
	if t.WorkspaceID == "" || t.UserID == "" {
		return ErrNoTenant
	}
	return withSettings(ctx, pool, map[string]string{
		"app.workspace_id": t.WorkspaceID,
		"app.user_id":      t.UserID,
	}, fn)
}

// WithUser is for user-scoped reads that span workspaces (e.g. "my
// workspaces"): RLS policies may match on app.user_id only.
func WithUser(ctx context.Context, pool *pgxpool.Pool, userID string, fn func(pgx.Tx) error) error {
	if userID == "" {
		return ErrNoTenant
	}
	return withSettings(ctx, pool, map[string]string{"app.user_id": userID}, fn)
}

func withSettings(ctx context.Context, pool *pgxpool.Pool, settings map[string]string, fn func(pgx.Tx) error) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("db: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	for key, value := range settings {
		if _, err := tx.Exec(ctx, `SELECT set_config($1, $2, true)`, key, value); err != nil {
			return fmt.Errorf("db: set %s: %w", key, err)
		}
	}
	if err := fn(tx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("db: commit: %w", err)
	}
	return nil
}
