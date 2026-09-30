// Package notificationsvc turns outbox events into in-app notifications,
// runs the DUE reminder scheduler, and serves the inbox (E9, ADR-0023).
package notificationsvc

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"slices"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/intellicars/list-app/apps/api/internal/apperr"
	"github.com/intellicars/list-app/apps/api/internal/db"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/notification/notificationmdl"
	"github.com/intellicars/list-app/apps/api/internal/uuidx"
)

var ErrNotFound = &apperr.NotFound{Detail: "This notification no longer exists."}

type NotificationSvc struct {
	pool *pgxpool.Pool
	log  *slog.Logger
}

func NewNotificationSvc(pool *pgxpool.Pool, log *slog.Logger) *NotificationSvc {
	return &NotificationSvc{pool: pool, log: log}
}

// List returns the caller's newest notifications in the active workspace.
func (s *NotificationSvc) List(ctx context.Context, t db.Tenant, unreadOnly bool) (mdl.ListRsp, error) {
	out := mdl.ListRsp{Notifications: []mdl.Notification{}}
	err := db.WithTenant(ctx, s.pool, t, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT n.id, n.kind, n.task_id, tk.title, n.task_title, n.detail, n.comment_body, n.created_at, n.read_at,
			       CASE WHEN m.user_id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name, 'image', u.image_url) END
			  FROM notifications n
			  LEFT JOIN tasks tk ON tk.id = n.task_id
			  LEFT JOIN users u ON u.id = n.actor_id
			  LEFT JOIN memberships m ON m.user_id = n.actor_id AND m.workspace_id = n.workspace_id
			 WHERE n.workspace_id = $1 AND n.user_id = $2 AND (NOT $3 OR n.read_at IS NULL)
			 ORDER BY n.created_at DESC, n.id DESC
			 LIMIT 100`, t.WorkspaceID, t.UserID, unreadOnly)
		if err != nil {
			return err
		}
		out.Notifications, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (mdl.Notification, error) {
			var n mdl.Notification
			var taskID, title *string
			var actor []byte
			if err := r.Scan(&n.ID, &n.Kind, &taskID, &title, &n.TaskTitle, &n.Detail, &n.CommentBody, &n.CreatedAt, &n.ReadAt, &actor); err != nil {
				return n, err
			}
			if taskID != nil && title != nil {
				n.Task = &mdl.TaskRef{ID: *taskID, Title: *title}
			}
			if actor != nil {
				n.Actor = &mdl.Person{}
				if err := json.Unmarshal(actor, n.Actor); err != nil {
					return n, err
				}
			}
			return n, nil
		})
		if err != nil {
			return err
		}
		return tx.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE workspace_id = $1 AND user_id = $2 AND read_at IS NULL`,
			t.WorkspaceID, t.UserID).Scan(&out.Unread)
	})
	if err != nil {
		return mdl.ListRsp{}, fmt.Errorf("notificationsvc: list: %w", err)
	}
	return out, nil
}

// MarkRead marks one of the caller's notifications read (idempotent).
func (s *NotificationSvc) MarkRead(ctx context.Context, t db.Tenant, id string) error {
	if !uuidx.Valid(id) {
		return ErrNotFound
	}
	err := db.WithTenant(ctx, s.pool, t, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `UPDATE notifications SET read_at = coalesce(read_at, now())
			WHERE id = $1 AND workspace_id = $2 AND user_id = $3`, id, t.WorkspaceID, t.UserID)
		if err == nil && tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return err
	})
	if errors.Is(err, ErrNotFound) {
		return ErrNotFound
	}
	return wrap("mark_read", err)
}

// MarkAllRead marks every unread notification in the workspace read.
func (s *NotificationSvc) MarkAllRead(ctx context.Context, t db.Tenant) error {
	return wrap("mark_all_read", db.WithTenant(ctx, s.pool, t, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `UPDATE notifications SET read_at = now()
			WHERE workspace_id = $1 AND user_id = $2 AND read_at IS NULL`, t.WorkspaceID, t.UserID)
		return err
	}))
}

// Settings returns every kind with its enabled flag (default on).
func (s *NotificationSvc) Settings(ctx context.Context, userID string) (mdl.SettingsRsp, error) {
	disabled := map[string]bool{}
	err := db.WithUser(ctx, s.pool, userID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `SELECT kind FROM notification_settings WHERE user_id = $1 AND NOT enabled`, userID)
		if err != nil {
			return err
		}
		kinds, err := pgx.CollectRows(rows, pgx.RowTo[string])
		for _, k := range kinds {
			disabled[k] = true
		}
		return err
	})
	if err != nil {
		return mdl.SettingsRsp{}, fmt.Errorf("notificationsvc: settings: %w", err)
	}
	out := mdl.SettingsRsp{Settings: make([]mdl.Setting, 0, len(mdl.Kinds))}
	for _, k := range mdl.Kinds {
		out.Settings = append(out.Settings, mdl.Setting{Kind: k, Enabled: !disabled[k]})
	}
	return out, nil
}

// UpdateSettings upserts the given kinds and returns the full set.
func (s *NotificationSvc) UpdateSettings(ctx context.Context, userID string, req mdl.SettingsReq) (mdl.SettingsRsp, error) {
	for _, st := range req.Settings {
		if !slices.Contains(mdl.Kinds, st.Kind) {
			return mdl.SettingsRsp{}, apperr.Field("settings", "Unknown notification type "+st.Kind)
		}
	}
	err := db.WithUser(ctx, s.pool, userID, func(tx pgx.Tx) error {
		for _, st := range req.Settings {
			if _, err := tx.Exec(ctx, `
				INSERT INTO notification_settings (user_id, kind, enabled) VALUES ($1, $2, $3)
				ON CONFLICT (user_id, kind) DO UPDATE SET enabled = EXCLUDED.enabled`, userID, st.Kind, st.Enabled); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return mdl.SettingsRsp{}, fmt.Errorf("notificationsvc: update settings: %w", err)
	}
	return s.Settings(ctx, userID)
}

func wrap(op string, err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("notificationsvc: %s: %w", op, err)
}
