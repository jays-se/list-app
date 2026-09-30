package tasksvc

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/intellicars/list-app/apps/api/internal/db"
)

// RemoveMemberTx detaches userID (named name) from every task in the
// workspace, inside the caller's transaction (E3-S6, ADR-0024): assignee
// and owner rows, checklist assignments, and pending requests, each with
// a history event by actorID. Authored content stays ("a former member").
func RemoveMemberTx(ctx context.Context, tx pgx.Tx, workspaceID, actorID, userID, name string) error {
	tn := Caller{Tenant: db.Tenant{WorkspaceID: workspaceID, UserID: actorID}}
	for _, set := range []struct{ table, kind string }{
		{"task_assignees", EvAssigneeRemoved},
		{"task_owners", EvOwnerRemoved},
	} {
		rows, err := tx.Query(ctx, `DELETE FROM `+set.table+` WHERE workspace_id = $1 AND user_id = $2 RETURNING task_id::text`, workspaceID, userID)
		if err != nil {
			return fmt.Errorf("tasksvc: remove member %s: %w", set.table, err)
		}
		taskIDs, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			return err
		}
		for _, id := range taskIDs {
			if _, err := tx.Exec(ctx, `UPDATE tasks SET version = version + 1, updated_at = now() WHERE id = $1`, id); err != nil {
				return err
			}
			if err := emit(ctx, tx, tn, id, event{Kind: set.kind, Subject: name}); err != nil {
				return err
			}
		}
	}
	rows, err := tx.Query(ctx, `
		UPDATE checklist_items SET assignee_id = NULL
		 WHERE workspace_id = $1 AND assignee_id = $2 RETURNING task_id::text, title`, workspaceID, userID)
	if err != nil {
		return fmt.Errorf("tasksvc: remove member checklist: %w", err)
	}
	type pair struct{ task, subject string }
	items, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (pair, error) {
		var p pair
		return p, r.Scan(&p.task, &p.subject)
	})
	if err != nil {
		return err
	}
	for _, it := range items {
		if err := emit(ctx, tx, tn, it.task, event{Kind: EvChecklistUnassign, Subject: it.subject, From: name}); err != nil {
			return err
		}
	}
	rows, err = tx.Query(ctx, `
		UPDATE change_requests SET status = 'CANCELED', decided_at = now()
		 WHERE workspace_id = $1 AND requester_id = $2 AND status = 'PENDING' RETURNING task_id::text, summary`, workspaceID, userID)
	if err != nil {
		return fmt.Errorf("tasksvc: remove member requests: %w", err)
	}
	reqs, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (pair, error) {
		var p pair
		return p, r.Scan(&p.task, &p.subject)
	})
	if err != nil {
		return err
	}
	for _, r := range reqs {
		if err := emit(ctx, tx, tn, r.task, event{Kind: EvRequestCanceled, Subject: r.subject}); err != nil {
			return err
		}
	}
	return nil
}
