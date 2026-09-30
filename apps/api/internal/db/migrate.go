package db

import (
	"context"
	"fmt"
	"io/fs"
	"regexp"
	"sort"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Migration is one numbered schema change with its rollback.
type Migration struct {
	Version int
	Name    string
	Up      string
	Down    string
}

var migrationFile = regexp.MustCompile(`^(\d{4})_([a-z0-9_]+)\.(up|down)\.sql$`)

// migrationLockID is an arbitrary constant for pg_advisory_lock so two
// instances never migrate at once.
const migrationLockID = 727_001

// LoadMigrations reads NNNN_name.up.sql / .down.sql pairs from fsys (root
// dir "migrations"), sorted by version. Every up needs a matching down.
func LoadMigrations(fsys fs.FS) ([]Migration, error) {
	entries, err := fs.ReadDir(fsys, "migrations")
	if err != nil {
		return nil, fmt.Errorf("db: read migrations: %w", err)
	}
	byVersion := map[int]*Migration{}
	for _, e := range entries {
		m := migrationFile.FindStringSubmatch(e.Name())
		if m == nil {
			return nil, fmt.Errorf("db: unexpected migration file %q", e.Name())
		}
		version, _ := strconv.Atoi(m[1])
		body, err := fs.ReadFile(fsys, "migrations/"+e.Name())
		if err != nil {
			return nil, fmt.Errorf("db: read %s: %w", e.Name(), err)
		}
		mig := byVersion[version]
		if mig == nil {
			mig = &Migration{Version: version, Name: m[2]}
			byVersion[version] = mig
		} else if mig.Name != m[2] {
			return nil, fmt.Errorf("db: version %04d has two names (%s, %s)", version, mig.Name, m[2])
		}
		if m[3] == "up" {
			mig.Up = string(body)
		} else {
			mig.Down = string(body)
		}
	}
	out := make([]Migration, 0, len(byVersion))
	for _, mig := range byVersion {
		if mig.Up == "" || mig.Down == "" {
			return nil, fmt.Errorf("db: migration %04d_%s needs both up and down", mig.Version, mig.Name)
		}
		out = append(out, *mig)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Version < out[j].Version })
	for i, mig := range out {
		if mig.Version != i+1 {
			return nil, fmt.Errorf("db: migrations must be contiguous from 0001; missing %04d", i+1)
		}
	}
	return out, nil
}

// Migrator applies and rolls back migrations, one transaction each.
type Migrator struct {
	pool       *pgxpool.Pool
	migrations []Migration
}

func NewMigrator(pool *pgxpool.Pool, migrations []Migration) *Migrator {
	return &Migrator{pool: pool, migrations: migrations}
}

// Up applies all pending migrations and returns the versions applied.
func (m *Migrator) Up(ctx context.Context) ([]int, error) {
	var applied []int
	err := m.withLock(ctx, func(conn *pgxpool.Conn) error {
		current, err := currentVersion(ctx, conn)
		if err != nil {
			return err
		}
		for _, mig := range m.migrations {
			if mig.Version <= current {
				continue
			}
			if err := apply(ctx, conn, mig.Up, func(tx pgx.Tx) error {
				_, err := tx.Exec(ctx, `INSERT INTO schema_migrations (version, name) VALUES ($1, $2)`, mig.Version, mig.Name)
				return err
			}); err != nil {
				return fmt.Errorf("db: migrate up %04d_%s: %w", mig.Version, mig.Name, err)
			}
			applied = append(applied, mig.Version)
		}
		return nil
	})
	return applied, err
}

// Down rolls back the latest `steps` migrations and returns their versions.
func (m *Migrator) Down(ctx context.Context, steps int) ([]int, error) {
	var reverted []int
	err := m.withLock(ctx, func(conn *pgxpool.Conn) error {
		current, err := currentVersion(ctx, conn)
		if err != nil {
			return err
		}
		for i := len(m.migrations) - 1; i >= 0 && len(reverted) < steps; i-- {
			mig := m.migrations[i]
			if mig.Version > current {
				continue
			}
			if err := apply(ctx, conn, mig.Down, func(tx pgx.Tx) error {
				_, err := tx.Exec(ctx, `DELETE FROM schema_migrations WHERE version = $1`, mig.Version)
				return err
			}); err != nil {
				return fmt.Errorf("db: migrate down %04d_%s: %w", mig.Version, mig.Name, err)
			}
			reverted = append(reverted, mig.Version)
		}
		return nil
	})
	return reverted, err
}

// Version returns the highest applied migration (0 when none).
func (m *Migrator) Version(ctx context.Context) (int, error) {
	var v int
	err := m.withLock(ctx, func(conn *pgxpool.Conn) error {
		var err error
		v, err = currentVersion(ctx, conn)
		return err
	})
	return v, err
}

func (m *Migrator) withLock(ctx context.Context, fn func(*pgxpool.Conn) error) error {
	conn, err := m.pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("db: acquire: %w", err)
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, `SELECT pg_advisory_lock($1)`, migrationLockID); err != nil {
		return fmt.Errorf("db: advisory lock: %w", err)
	}
	defer func() { _, _ = conn.Exec(context.WithoutCancel(ctx), `SELECT pg_advisory_unlock($1)`, migrationLockID) }()
	if _, err := conn.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version    integer PRIMARY KEY,
		name       text NOT NULL,
		applied_at timestamptz NOT NULL DEFAULT now()
	)`); err != nil {
		return fmt.Errorf("db: ensure schema_migrations: %w", err)
	}
	return fn(conn)
}

func currentVersion(ctx context.Context, conn *pgxpool.Conn) (int, error) {
	var v int
	if err := conn.QueryRow(ctx, `SELECT coalesce(max(version), 0) FROM schema_migrations`).Scan(&v); err != nil {
		return 0, fmt.Errorf("db: read version: %w", err)
	}
	return v, nil
}

func apply(ctx context.Context, conn *pgxpool.Conn, sql string, record func(pgx.Tx) error) error {
	tx, err := conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, sql); err != nil {
		return err
	}
	if err := record(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
