package notificationsvc

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/intellicars/list-app/apps/api/internal/outbox"
)

// Status labels for STATUS details (mirror packages/domain tasks.labels.ts).
var statusLabel = map[string]string{
	"BACKLOG": "Backlog", "TODO": "To do", "IN_PROGRESS": "In progress",
	"TESTING": "Testing", "DONE": "Done", "CANCELED": "Canceled",
}

// note is one notification to fan out to recipients.
type note struct {
	WorkspaceID, Kind, TaskID, ActorID, Detail, DedupeKey string
	CommentBody                                           *string
}

// deliver inserts note for each recipient who is still a member, isn't the
// actor, and hasn't turned the kind off. Duplicate keys are ignored, which
// makes redelivery harmless.
func deliver(ctx context.Context, tx pgx.Tx, n note, recipients []string) (int, error) {
	recipients = slices.Compact(slices.Sorted(slices.Values(recipients)))
	recipients = slices.DeleteFunc(recipients, func(id string) bool { return id == "" || id == n.ActorID })
	if len(recipients) == 0 {
		return 0, nil
	}
	var actor *string
	if n.ActorID != "" {
		actor = &n.ActorID
	}
	tag, err := tx.Exec(ctx, `
		INSERT INTO notifications (workspace_id, user_id, kind, task_id, task_title, actor_id, detail, comment_body, dedupe_key)
		SELECT $1, m.user_id, $2, t.id, t.title, $4, $5, $6, $7
		  FROM memberships m
		  JOIN tasks t ON t.id = $3
		 WHERE m.workspace_id = $1 AND m.user_id::text = ANY($8)
		   AND NOT EXISTS (SELECT 1 FROM notification_settings ns WHERE ns.user_id = m.user_id AND ns.kind = $2 AND NOT ns.enabled)
		ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
		n.WorkspaceID, n.Kind, n.TaskID, actor, n.Detail, n.CommentBody, n.DedupeKey, recipients)
	if err != nil {
		return 0, fmt.Errorf("notificationsvc: deliver %s: %w", n.Kind, err)
	}
	return int(tag.RowsAffected()), nil
}

// taskPeople returns creator, owners and assignees of a task (nil, nil if
// the task was deleted before dispatch).
func taskPeople(ctx context.Context, tx pgx.Tx, taskID string) (creator string, owners, assignees []string, err error) {
	err = tx.QueryRow(ctx, `
		SELECT t.created_by::text,
		       coalesce((SELECT array_agg(user_id::text) FROM task_owners WHERE task_id = t.id), '{}'),
		       coalesce((SELECT array_agg(user_id::text) FROM task_assignees WHERE task_id = t.id), '{}')
		  FROM tasks t WHERE t.id = $1`, taskID).Scan(&creator, &owners, &assignees)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil, nil, nil
	}
	return creator, owners, assignees, err
}

func decode[T any](ev outbox.Event) (T, error) {
	var v T
	err := json.Unmarshal(ev.Payload, &v)
	return v, err
}

func key(ev outbox.Event) string { return fmt.Sprintf("outbox:%d", ev.ID) }

// Register subscribes the notification handlers to the dispatcher.
func (s *NotificationSvc) Register(d *outbox.Dispatcher) {
	d.Handle(outbox.KindTaskAssigned, func(ctx context.Context, tx pgx.Tx, ev outbox.Event) error {
		p, err := decode[outbox.TaskAssigned](ev)
		if err != nil {
			return err
		}
		_, err = deliver(ctx, tx, note{WorkspaceID: ev.WorkspaceID, Kind: "ASSIGNED", TaskID: p.TaskID, ActorID: p.ActorID,
			Detail: "assigned you", DedupeKey: key(ev)}, p.UserIDs)
		return err
	})
	d.Handle(outbox.KindTaskStatus, func(ctx context.Context, tx pgx.Tx, ev outbox.Event) error {
		p, err := decode[outbox.TaskStatus](ev)
		if err != nil {
			return err
		}
		creator, owners, assignees, err := taskPeople(ctx, tx, p.TaskID)
		if err != nil || creator == "" {
			return err
		}
		_, err = deliver(ctx, tx, note{WorkspaceID: ev.WorkspaceID, Kind: "STATUS", TaskID: p.TaskID, ActorID: p.ActorID,
			Detail: "changed the status to " + statusLabel[p.To], DedupeKey: key(ev)},
			append(append([]string{creator}, owners...), assignees...))
		return err
	})
	d.Handle(outbox.KindCommentMentioned, func(ctx context.Context, tx pgx.Tx, ev outbox.Event) error {
		p, err := decode[outbox.CommentMentioned](ev)
		if err != nil {
			return err
		}
		var body *string
		if err := tx.QueryRow(ctx, `SELECT left(body, 280) FROM comments WHERE id = $1`, p.CommentID).Scan(&body); err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		_, err = deliver(ctx, tx, note{WorkspaceID: ev.WorkspaceID, Kind: "MENTION", TaskID: p.TaskID, ActorID: p.ActorID,
			Detail: "mentioned you", CommentBody: body, DedupeKey: key(ev)}, p.UserIDs)
		return err
	})
	d.Handle(outbox.KindRequestCreated, func(ctx context.Context, tx pgx.Tx, ev outbox.Event) error {
		p, err := decode[outbox.RequestCreated](ev)
		if err != nil {
			return err
		}
		creator, owners, _, err := taskPeople(ctx, tx, p.TaskID)
		if err != nil || creator == "" {
			return err
		}
		_, err = deliver(ctx, tx, note{WorkspaceID: ev.WorkspaceID, Kind: "REQUEST", TaskID: p.TaskID, ActorID: p.ActorID,
			Detail: "requested: " + p.Summary, DedupeKey: key(ev)}, append([]string{creator}, owners...))
		return err
	})
	d.Handle(outbox.KindRequestReviewed, func(ctx context.Context, tx pgx.Tx, ev outbox.Event) error {
		p, err := decode[outbox.RequestReviewed](ev)
		if err != nil {
			return err
		}
		verb := "rejected"
		if p.Approved {
			verb = "approved"
		}
		_, err = deliver(ctx, tx, note{WorkspaceID: ev.WorkspaceID, Kind: "REVIEWED", TaskID: p.TaskID, ActorID: p.ActorID,
			Detail: verb + " your request: " + p.Summary, DedupeKey: key(ev)}, []string{p.RequesterID})
		return err
	})
}

// RunDue creates DUE reminders for open tasks due tomorrow (UTC) in every
// workspace. The dedupe key makes it safe to run hourly and on every
// instance.
func (s *NotificationSvc) RunDue(ctx context.Context, now time.Time) (int, error) {
	tomorrow := now.UTC().AddDate(0, 0, 1).Format("2006-01-02")
	rows, err := s.pool.Query(ctx, `SELECT id::text FROM workspaces ORDER BY id`)
	if err != nil {
		return 0, fmt.Errorf("notificationsvc: due workspaces: %w", err)
	}
	workspaces, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return 0, fmt.Errorf("notificationsvc: due workspaces: %w", err)
	}
	total := 0
	for _, ws := range workspaces {
		n, err := s.dueIn(ctx, ws, tomorrow)
		if err != nil {
			return total, err
		}
		total += n
	}
	return total, nil
}

func (s *NotificationSvc) dueIn(ctx context.Context, workspaceID, day string) (int, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `SELECT set_config('app.workspace_id', $1, true)`, workspaceID); err != nil {
		return 0, err
	}
	rows, err := tx.Query(ctx, `
		SELECT t.id::text, t.created_by::text,
		       coalesce((SELECT array_agg(user_id::text) FROM task_assignees WHERE task_id = t.id), '{}')
		  FROM tasks t
		 WHERE t.workspace_id = $1 AND t.due_date = $2::date AND t.status NOT IN ('DONE', 'CANCELED')`, workspaceID, day)
	if err != nil {
		return 0, err
	}
	type due struct {
		id, creator string
		assignees   []string
	}
	tasks, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (due, error) {
		var d due
		return d, r.Scan(&d.id, &d.creator, &d.assignees)
	})
	if err != nil {
		return 0, err
	}
	total := 0
	for _, t := range tasks {
		recipients := t.assignees
		if len(recipients) == 0 {
			recipients = []string{t.creator}
		}
		n, err := deliver(ctx, tx, note{WorkspaceID: workspaceID, Kind: "DUE", TaskID: t.id,
			Detail: "is due tomorrow", DedupeKey: "due:" + t.id + ":" + day}, recipients)
		if err != nil {
			return 0, err
		}
		total += n
	}
	return total, tx.Commit(ctx)
}

// RunDueScheduler checks hourly until ctx is done.
func (s *NotificationSvc) RunDueScheduler(ctx context.Context, now func() time.Time) {
	t := time.NewTicker(time.Hour)
	defer t.Stop()
	for {
		if n, err := s.RunDue(ctx, now()); err != nil && ctx.Err() == nil {
			s.log.Error("due_reminders_failed", "error", err)
		} else if n > 0 {
			s.log.Info("due_reminders_sent", "count", n)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}
