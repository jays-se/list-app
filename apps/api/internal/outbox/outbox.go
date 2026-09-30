// Package outbox is the transactional outbox (E2-S4, ADR-0023). Services
// Emit events inside the transaction that makes a change; the Dispatcher
// delivers them to handlers after commit, at least once, with backoff.
package outbox

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Event kinds and payloads (the notification module consumes them).
const (
	KindTaskAssigned     = "task.assigned"
	KindTaskStatus       = "task.status"
	KindCommentMentioned = "comment.mentioned"
	KindRequestCreated   = "request.created"
	KindRequestReviewed  = "request.reviewed"
)

type TaskAssigned struct {
	TaskID  string   `json:"taskId"`
	ActorID string   `json:"actorId"`
	UserIDs []string `json:"userIds"`
}

type TaskStatus struct {
	TaskID  string `json:"taskId"`
	ActorID string `json:"actorId"`
	To      string `json:"to"`
}

type CommentMentioned struct {
	TaskID    string   `json:"taskId"`
	ActorID   string   `json:"actorId"`
	CommentID string   `json:"commentId"`
	UserIDs   []string `json:"userIds"`
}

type RequestCreated struct {
	TaskID    string `json:"taskId"`
	ActorID   string `json:"actorId"`
	RequestID string `json:"requestId"`
	Summary   string `json:"summary"`
}

type RequestReviewed struct {
	TaskID      string `json:"taskId"`
	ActorID     string `json:"actorId"`
	RequestID   string `json:"requestId"`
	RequesterID string `json:"requesterId"`
	Approved    bool   `json:"approved"`
	Summary     string `json:"summary"`
}

// Emit appends an event in the caller's transaction.
func Emit(ctx context.Context, tx pgx.Tx, workspaceID, kind string, payload any) error {
	b, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("outbox: marshal %s: %w", kind, err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO outbox (workspace_id, kind, payload) VALUES ($1, $2, $3::jsonb)`, workspaceID, kind, string(b)); err != nil {
		return fmt.Errorf("outbox: emit %s: %w", kind, err)
	}
	return nil
}

// Event is one claimed outbox row.
type Event struct {
	ID          int64
	WorkspaceID string
	Kind        string
	Payload     json.RawMessage
	Attempts    int
}

// Handler processes an event inside the dispatcher's transaction, whose
// RLS context is the event's workspace. It must be idempotent.
type Handler func(ctx context.Context, tx pgx.Tx, ev Event) error

const (
	MaxAttempts = 10
	maxBackoff  = time.Hour
)

type Dispatcher struct {
	pool     *pgxpool.Pool
	log      *slog.Logger
	handlers map[string]Handler
	// Interval between polls when the outbox is empty.
	Interval time.Duration
}

func NewDispatcher(pool *pgxpool.Pool, log *slog.Logger) *Dispatcher {
	return &Dispatcher{pool: pool, log: log, handlers: map[string]Handler{}, Interval: time.Second}
}

// Handle registers the handler for kind (one per kind).
func (d *Dispatcher) Handle(kind string, h Handler) { d.handlers[kind] = h }

// Run dispatches until ctx is done.
func (d *Dispatcher) Run(ctx context.Context) {
	d.log.Info("outbox_dispatcher_started")
	defer d.log.Info("outbox_dispatcher_stopped")
	t := time.NewTicker(d.Interval)
	defer t.Stop()
	for {
		if _, err := d.RunOnce(ctx, 100); err != nil && ctx.Err() == nil {
			d.log.Error("outbox_dispatch_failed", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// RunOnce processes up to limit due events and returns how many it handled.
func (d *Dispatcher) RunOnce(ctx context.Context, limit int) (int, error) {
	n := 0
	for n < limit {
		ok, err := d.next(ctx)
		if err != nil || !ok {
			return n, err
		}
		n++
	}
	return n, nil
}

// next claims one due row (SKIP LOCKED, so instances never share a row),
// runs its handler in a savepoint and records the outcome.
func (d *Dispatcher) next(ctx context.Context) (bool, error) {
	tx, err := d.pool.Begin(ctx)
	if err != nil {
		return false, fmt.Errorf("outbox: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var ev Event
	err = tx.QueryRow(ctx, `
		SELECT id, workspace_id, kind, payload, attempts FROM outbox
		 WHERE processed_at IS NULL AND available_at <= now() AND attempts < $1
		 ORDER BY available_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`, MaxAttempts).
		Scan(&ev.ID, &ev.WorkspaceID, &ev.Kind, &ev.Payload, &ev.Attempts)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("outbox: claim: %w", err)
	}
	if _, err := tx.Exec(ctx, `SELECT set_config('app.workspace_id', $1, true)`, ev.WorkspaceID); err != nil {
		return false, fmt.Errorf("outbox: set tenant: %w", err)
	}
	herr := d.handle(ctx, tx, ev)
	if herr == nil {
		_, err = tx.Exec(ctx, `UPDATE outbox SET processed_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = $1`, ev.ID)
	} else {
		d.log.Warn("outbox_handler_failed", "id", ev.ID, "kind", ev.Kind, "attempt", ev.Attempts+1, "error", herr)
		_, err = tx.Exec(ctx, `UPDATE outbox SET attempts = attempts + 1, last_error = $2,
			available_at = now() + make_interval(secs => $3) WHERE id = $1`,
			ev.ID, herr.Error(), Backoff(ev.Attempts+1).Seconds())
	}
	if err != nil {
		return false, fmt.Errorf("outbox: record: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return false, fmt.Errorf("outbox: commit: %w", err)
	}
	return true, nil
}

// handle runs the handler in a savepoint so a failure rolls back only its
// own writes, never the bookkeeping.
func (d *Dispatcher) handle(ctx context.Context, tx pgx.Tx, ev Event) error {
	h, ok := d.handlers[ev.Kind]
	if !ok {
		d.log.Warn("outbox_no_handler", "id", ev.ID, "kind", ev.Kind)
		return nil
	}
	sp, err := tx.Begin(ctx)
	if err != nil {
		return err
	}
	if err := h(ctx, sp, ev); err != nil {
		_ = sp.Rollback(ctx)
		return err
	}
	return sp.Commit(ctx)
}

// Backoff is 2^attempt seconds, capped at an hour.
func Backoff(attempt int) time.Duration {
	if attempt > 12 {
		return maxBackoff
	}
	return min(time.Duration(1<<attempt)*time.Second, maxBackoff)
}
