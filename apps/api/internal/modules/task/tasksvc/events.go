package tasksvc

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// Event kinds (api/openapi.yaml#TaskEventKind).
const (
	EvCreated           = "CREATED"
	EvStatus            = "STATUS"
	EvUpdated           = "UPDATED"
	EvAssigneeAdded     = "ASSIGNEE_ADDED"
	EvAssigneeRemoved   = "ASSIGNEE_REMOVED"
	EvLabelAdded        = "LABEL_ADDED"
	EvLabelRemoved      = "LABEL_REMOVED"
	EvOwnerAdded        = "OWNER_ADDED"
	EvOwnerRemoved      = "OWNER_REMOVED"
	EvChecklistAdded    = "CHECKLIST_ADDED"
	EvChecklistChecked  = "CHECKLIST_CHECKED"
	EvChecklistUnchk    = "CHECKLIST_UNCHECKED"
	EvChecklistRenamed  = "CHECKLIST_RENAMED"
	EvChecklistAssigned = "CHECKLIST_ASSIGNED"
	EvChecklistUnassign = "CHECKLIST_UNASSIGNED"
	EvChecklistRemoved  = "CHECKLIST_REMOVED"
	EvCommented         = "COMMENTED"
	EvAttachmentAdded   = "ATTACHMENT_ADDED"
	EvAttachmentRemoved = "ATTACHMENT_REMOVED"
	EvSubtaskAdded      = "SUBTASK_ADDED"
)

// event is one row for task_events; empty strings are stored as NULL.
type event struct {
	Kind, Field, From, To, Subject string
}

func nullable(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// emit appends events for a task in the caller's transaction (same commit
// as the change they describe).
func emit(ctx context.Context, tx pgx.Tx, tn Caller, taskID string, events ...event) error {
	for _, e := range events {
		if _, err := tx.Exec(ctx, `
			INSERT INTO task_events (workspace_id, task_id, actor_id, kind, field, from_value, to_value, subject)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			tn.WorkspaceID, taskID, tn.UserID, e.Kind, nullable(e.Field), nullable(e.From), nullable(e.To), nullable(e.Subject)); err != nil {
			return fmt.Errorf("tasksvc: emit %s: %w", e.Kind, err)
		}
	}
	return nil
}

// enterStatus closes the open stage and opens one for status (E6-S1).
func enterStatus(ctx context.Context, tx pgx.Tx, workspaceID, taskID, status string) error {
	if _, err := tx.Exec(ctx, `UPDATE task_status_stages SET left_at = clock_timestamp() WHERE task_id = $1 AND left_at IS NULL`, taskID); err != nil {
		return fmt.Errorf("tasksvc: close stage: %w", err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO task_status_stages (workspace_id, task_id, status) VALUES ($1, $2, $3)`, workspaceID, taskID, status); err != nil {
		return fmt.Errorf("tasksvc: open stage: %w", err)
	}
	return nil
}

// truncate keeps event values readable (full text stays on the task).
func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n-1]) + "…"
}
