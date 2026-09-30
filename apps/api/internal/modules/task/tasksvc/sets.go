package tasksvc

import (
	"context"
	"slices"

	"github.com/jackc/pgx/v5"

	"github.com/intellicars/list-app/apps/api/internal/apperr"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/task/taskmdl"
	"github.com/intellicars/list-app/apps/api/internal/outbox"
	"github.com/intellicars/list-app/apps/api/internal/uuidx"
)

// Set kinds for ReplaceSet.
type Set int

const (
	SetAssignees Set = iota
	SetOwners
	SetLabels
)

type named struct{ id, name string }

// ReplaceSet replaces a task's assignees, owners or labels, recording one
// ADDED/REMOVED event per difference.
func (s *TaskSvc) ReplaceSet(ctx context.Context, tn Caller, id string, kind Set, ids []string) (mdl.Task, mdl.Viewer, error) {
	var task mdl.Task
	err := dbTenant(ctx, s, tn, func(tx pgx.Tx) error {
		cur, err := load(ctx, tx, tn.WorkspaceID, id, true)
		if err != nil {
			return err
		}
		action := map[Set]Action{SetAssignees: ActionSetAssignees, SetOwners: ActionSetOwners, SetLabels: ActionSetLabels}[kind]
		if err := Authorize(accessOf(cur, tn), tn.UserID, action); err != nil {
			return err
		}
		if err := replaceSetTx(ctx, tx, tn, cur, kind, ids); err != nil {
			return err
		}
		task, err = loadDetail(ctx, tx, tn.WorkspaceID, id)
		return err
	})
	if err != nil {
		return mdl.Task{}, mdl.Viewer{}, wrap("replace_set", err)
	}
	return task, Evaluate(accessOf(task, tn), tn.UserID), nil
}

// replaceSetTx rewrites one set of cur (locked and authorized by the
// caller); approving ASSIGNEE_ADD/REMOVE requests reuses it (ADR-0023).
func replaceSetTx(ctx context.Context, tx pgx.Tx, tn Caller, cur mdl.Task, kind Set, ids []string) error {
	ids = dedupe(ids)
	var (
		table, column, added, removed string
		before                        []named
	)
	switch kind {
	case SetAssignees:
		table, column, added, removed = "task_assignees", "user_id", EvAssigneeAdded, EvAssigneeRemoved
		before = people(cur.Assignees)
	case SetOwners:
		table, column, added, removed = "task_owners", "user_id", EvOwnerAdded, EvOwnerRemoved
		before = people(cur.Owners)
		// The creator already manages the task and is never listed as an owner.
		ids = slices.DeleteFunc(ids, func(uid string) bool { return uid == cur.CreatedBy.ID })
	case SetLabels:
		table, column, added, removed = "task_labels", "label_id", EvLabelAdded, EvLabelRemoved
		for _, l := range cur.Labels {
			before = append(before, named{l.ID, l.Name})
		}
	}
	var err error
	if kind == SetLabels {
		err = checkLabels(ctx, tx, tn.WorkspaceID, ids)
	} else {
		err = checkMembers(ctx, tx, tn.WorkspaceID, ids, "userIds")
	}
	if err != nil {
		return err
	}
	if err := replaceSet(ctx, tx, table, column, tn.WorkspaceID, cur.ID, ids); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE tasks SET version = version + 1, updated_at = now() WHERE id = $1`, cur.ID); err != nil {
		return err
	}
	task, err := load(ctx, tx, tn.WorkspaceID, cur.ID, false)
	if err != nil {
		return err
	}
	var after []named
	switch kind {
	case SetAssignees:
		after = people(task.Assignees)
	case SetOwners:
		after = people(task.Owners)
	case SetLabels:
		for _, l := range task.Labels {
			after = append(after, named{l.ID, l.Name})
		}
	}
	if kind == SetAssignees {
		var newIDs []string
		for _, n := range after {
			if !slices.ContainsFunc(before, func(b named) bool { return b.id == n.id }) {
				newIDs = append(newIDs, n.id)
			}
		}
		if len(newIDs) > 0 {
			if err := outbox.Emit(ctx, tx, tn.WorkspaceID, outbox.KindTaskAssigned,
				outbox.TaskAssigned{TaskID: cur.ID, ActorID: tn.UserID, UserIDs: newIDs}); err != nil {
				return err
			}
		}
	}
	return emit(ctx, tx, tn, cur.ID, diffEvents(before, after, added, removed)...)
}

func people(ps []mdl.Person) []named {
	out := make([]named, 0, len(ps))
	for _, p := range ps {
		out = append(out, named{p.ID, p.Name})
	}
	return out
}

func diffEvents(before, after []named, added, removed string) []event {
	has := func(xs []named, id string) bool {
		return slices.ContainsFunc(xs, func(n named) bool { return n.id == id })
	}
	var out []event
	for _, n := range after {
		if !has(before, n.id) {
			out = append(out, event{Kind: added, Subject: n.name})
		}
	}
	for _, n := range before {
		if !has(after, n.id) {
			out = append(out, event{Kind: removed, Subject: n.name})
		}
	}
	return out
}

func checkMembers(ctx context.Context, tx pgx.Tx, workspaceID string, ids []string, field string) error {
	ids = dedupe(ids)
	if len(ids) == 0 {
		return nil
	}
	if !uuidx.AllValid(ids) {
		return apperr.Field(field, "Choose people from this workspace")
	}
	var n int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM memberships WHERE workspace_id = $1 AND user_id::text = ANY($2)`,
		workspaceID, ids).Scan(&n); err != nil {
		return err
	}
	if n != len(ids) {
		return apperr.Field(field, "Choose people from this workspace")
	}
	return nil
}

func checkLabels(ctx context.Context, tx pgx.Tx, workspaceID string, ids []string) error {
	ids = dedupe(ids)
	if len(ids) == 0 {
		return nil
	}
	if !uuidx.AllValid(ids) {
		return apperr.Field("labelIds", "Choose labels from this workspace")
	}
	var n int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM labels WHERE workspace_id = $1 AND id::text = ANY($2)`,
		workspaceID, ids).Scan(&n); err != nil {
		return err
	}
	if n != len(ids) {
		return apperr.Field("labelIds", "Choose labels from this workspace")
	}
	return nil
}

// replaceSet rewrites one of the task_* join tables. table/column are
// compile-time constants from this package, never user input.
func replaceSet(ctx context.Context, tx pgx.Tx, table, column, workspaceID, taskID string, ids []string) error {
	if _, err := tx.Exec(ctx, `DELETE FROM `+table+` WHERE task_id = $1`, taskID); err != nil {
		return err
	}
	ids = dedupe(ids)
	if len(ids) == 0 {
		return nil
	}
	_, err := tx.Exec(ctx, `INSERT INTO `+table+` (workspace_id, task_id, `+column+`)
		SELECT $1, $2, x::uuid FROM unnest($3::text[]) AS x`, workspaceID, taskID, ids)
	return err
}

func dedupe(ids []string) []string {
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if id != "" && !slices.Contains(out, id) {
			out = append(out, id)
		}
	}
	return out
}
