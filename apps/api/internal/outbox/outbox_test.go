package outbox_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/intellicars/list-app/apps/api/internal/outbox"
	"github.com/intellicars/list-app/apps/api/internal/testdb"
)

func TestBackoff(t *testing.T) {
	for attempt, want := range map[int]time.Duration{1: 2 * time.Second, 5: 32 * time.Second, 12: time.Hour, 40: time.Hour} {
		if got := outbox.Backoff(attempt); got != want {
			t.Fatalf("Backoff(%d) = %v, want %v", attempt, got, want)
		}
	}
}

func TestDispatcher(t *testing.T) {
	pool := testdb.Pool(t)
	ctx := context.Background()
	var ws string
	if err := pool.QueryRow(ctx, `
		WITH u AS (INSERT INTO users (email, name, auth_provider, auth_subject) VALUES ('o@x.io', 'O', 'dev', 'o') RETURNING id)
		INSERT INTO workspaces (name, invite_code, created_by) SELECT 'W', 'c', id FROM u RETURNING id`).Scan(&ws); err != nil {
		t.Fatal(err)
	}
	emit := func(kind string) {
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if err := outbox.Emit(ctx, tx, ws, kind, map[string]string{"k": kind}); err != nil {
			t.Fatal(err)
		}
		if err := tx.Commit(ctx); err != nil {
			t.Fatal(err)
		}
	}
	d := outbox.NewDispatcher(pool, slog.New(slog.NewTextHandler(io.Discard, nil)))
	var seen []string
	fail := true
	d.Handle("ok", func(ctx context.Context, tx pgx.Tx, ev outbox.Event) error {
		var tenant string
		_ = tx.QueryRow(ctx, `SELECT current_setting('app.workspace_id', true)`).Scan(&tenant)
		if tenant != ws || string(ev.Payload) != `{"k": "ok"}` {
			t.Errorf("tenant=%q payload=%s", tenant, ev.Payload)
		}
		seen = append(seen, ev.Kind)
		return nil
	})
	d.Handle("flaky", func(ctx context.Context, tx pgx.Tx, ev outbox.Event) error {
		// Writes inside a failed handler roll back with its savepoint.
		if _, err := tx.Exec(ctx, `UPDATE workspaces SET name = 'changed'`); err != nil {
			return err
		}
		if fail {
			return errors.New("boom")
		}
		seen = append(seen, ev.Kind)
		return nil
	})
	emit("ok")
	emit("flaky")
	emit("unknown")

	if n, err := d.RunOnce(ctx, 10); err != nil || n != 3 {
		t.Fatalf("RunOnce = %d, %v", n, err)
	}
	var attempts int
	var lastErr string
	var name string
	_ = pool.QueryRow(ctx, `SELECT attempts, last_error FROM outbox WHERE kind = 'flaky'`).Scan(&attempts, &lastErr)
	_ = pool.QueryRow(ctx, `SELECT name FROM workspaces`).Scan(&name)
	if attempts != 1 || lastErr != "boom" || name != "W" {
		t.Fatalf("after failure: attempts=%d err=%q name=%q", attempts, lastErr, name)
	}
	// Backed off: nothing due yet.
	if n, _ := d.RunOnce(ctx, 10); n != 0 {
		t.Fatalf("re-ran before backoff: %d", n)
	}
	fail = false
	_, _ = pool.Exec(ctx, `UPDATE outbox SET available_at = now() WHERE kind = 'flaky'`)
	if n, err := d.RunOnce(ctx, 10); err != nil || n != 1 {
		t.Fatalf("retry = %d, %v", n, err)
	}
	if len(seen) != 2 || seen[0] != "ok" || seen[1] != "flaky" {
		t.Fatalf("seen = %v", seen)
	}
	var pending int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM outbox WHERE processed_at IS NULL`).Scan(&pending)
	if pending != 0 {
		t.Fatalf("pending = %d", pending)
	}

	// A row locked by another instance is skipped, not waited on.
	emit("ok")
	tx, _ := pool.Begin(ctx)
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `SELECT id FROM outbox WHERE processed_at IS NULL FOR UPDATE`); err != nil {
		t.Fatal(err)
	}
	if n, err := d.RunOnce(ctx, 10); err != nil || n != 0 {
		t.Fatalf("locked row: %d, %v", n, err)
	}
	// Run stops with its context.
	runCtx, cancel := context.WithCancel(ctx)
	done := make(chan struct{})
	go func() { d.Run(runCtx); close(done) }()
	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Run did not stop")
	}
}
