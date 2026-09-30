// Package tasksvc implements tasks (E4-S1, E4-S5): list with filters, CRUD,
// assignees/owners/labels, the permission policy (E5-S1) and optimistic
// concurrency via a version column. Everything runs in db.WithTenant (RLS).
package tasksvc

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/intellicars/list-app/apps/api/internal/apperr"
	"github.com/intellicars/list-app/apps/api/internal/db"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/task/taskmdl"
	"github.com/intellicars/list-app/apps/api/internal/uuidx"
)

var (
	ErrNotFound       = &apperr.NotFound{Detail: "This task no longer exists."}
	ErrStale          = &apperr.Conflict{Type: "conflict", Detail: "Someone else changed this task. Reload to see the latest version."}
	ErrMissingIfMatch = &apperr.Precondition{Detail: "Send If-Match with the task version you edited."}
)

type TaskSvc struct {
	pool *pgxpool.Pool
	log  *slog.Logger
}

func NewTaskSvc(pool *pgxpool.Pool, log *slog.Logger) *TaskSvc { return &TaskSvc{pool: pool, log: log} }

// taskSelect loads a task with its people and labels as JSON aggregates.
const taskSelect = `
SELECT t.id, t.title, t.description, t.status, t.priority, t.start_date, t.end_date, t.due_date,
       t.created_at, t.updated_at, t.version,
       json_build_object('id', cu.id, 'name', cu.name, 'image', cu.image_url),
       coalesce((SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'image', u.image_url) ORDER BY lower(u.name), u.id)
                   FROM task_assignees a JOIN users u ON u.id = a.user_id WHERE a.task_id = t.id), '[]'),
       coalesce((SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'image', u.image_url) ORDER BY lower(u.name), u.id)
                   FROM task_owners o JOIN users u ON u.id = o.user_id WHERE o.task_id = t.id), '[]'),
       coalesce((SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color) ORDER BY lower(l.name), l.id)
                   FROM task_labels tl JOIN labels l ON l.id = tl.label_id WHERE tl.task_id = t.id), '[]')
  FROM tasks t JOIN users cu ON cu.id = t.created_by`

func scanTask(row pgx.Row) (mdl.Task, error) {
	var t mdl.Task
	err := row.Scan(&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority, &t.StartDate, &t.EndDate, &t.DueDate,
		&t.CreatedAt, &t.UpdatedAt, &t.Version, &t.CreatedBy, &t.Assignees, &t.Owners, &t.Labels)
	return t, err
}

// List returns the workspace's tasks, due date first (no date last), then newest.
func (s *TaskSvc) List(ctx context.Context, tn db.Tenant, f mdl.Filter) ([]mdl.Task, error) {
	if f.Status != "" && !slices.Contains(mdl.Statuses, f.Status) {
		return nil, apperr.Field("status", MsgUnknownStatus)
	}
	if (f.AssigneeID != "" && !uuidx.Valid(f.AssigneeID)) || (f.LabelID != "" && !uuidx.Valid(f.LabelID)) {
		return []mdl.Task{}, nil // unknown ids simply match nothing
	}
	var tasks []mdl.Task
	err := db.WithTenant(ctx, s.pool, tn, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, taskSelect+`
		 WHERE t.workspace_id = $1
		   AND ($2 = '' OR t.status = $2)
		   AND ($3 = '' OR EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id = t.id AND a.user_id::text = $3))
		   AND ($4 = '' OR EXISTS (SELECT 1 FROM task_labels tl WHERE tl.task_id = t.id AND tl.label_id::text = $4))
		 ORDER BY t.due_date NULLS LAST, t.created_at DESC, t.id
		 LIMIT 5000`, tn.WorkspaceID, f.Status, f.AssigneeID, f.LabelID)
		if err != nil {
			return err
		}
		tasks, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (mdl.Task, error) { return scanTask(r) })
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("tasksvc: list: %w", err)
	}
	return tasks, nil
}

// Get returns one task and the caller's permissions.
func (s *TaskSvc) Get(ctx context.Context, tn db.Tenant, id string) (mdl.Task, mdl.Viewer, error) {
	var task mdl.Task
	err := db.WithTenant(ctx, s.pool, tn, func(tx pgx.Tx) error {
		var err error
		task, err = load(ctx, tx, tn.WorkspaceID, id, false)
		return err
	})
	if err != nil {
		return mdl.Task{}, mdl.Viewer{}, err
	}
	return task, Evaluate(accessOf(task), tn.UserID), nil
}

func load(ctx context.Context, tx pgx.Tx, workspaceID, id string, lock bool) (mdl.Task, error) {
	if !uuidx.Valid(id) {
		return mdl.Task{}, ErrNotFound
	}
	if lock {
		if _, err := tx.Exec(ctx, `SELECT 1 FROM tasks WHERE id = $1 AND workspace_id = $2 FOR UPDATE`, id, workspaceID); err != nil {
			return mdl.Task{}, fmt.Errorf("tasksvc: lock: %w", err)
		}
	}
	t, err := scanTask(tx.QueryRow(ctx, taskSelect+` WHERE t.id = $1 AND t.workspace_id = $2`, id, workspaceID))
	if errors.Is(err, pgx.ErrNoRows) {
		return mdl.Task{}, ErrNotFound
	}
	if err != nil {
		return mdl.Task{}, fmt.Errorf("tasksvc: load: %w", err)
	}
	return t, nil
}

// Create inserts a task created by the caller, with optional assignees/labels.
func (s *TaskSvc) Create(ctx context.Context, tn db.Tenant, req mdl.CreateTaskReq) (mdl.Task, mdl.Viewer, error) {
	v, err := validate(fields{
		Title: req.Title, Description: req.Description,
		Status: orDefault(req.Status, "TODO"), Priority: orDefault(req.Priority, "NONE"),
		StartDate: req.StartDate, EndDate: req.EndDate, DueDate: req.DueDate,
	})
	if err != nil {
		return mdl.Task{}, mdl.Viewer{}, err
	}
	var task mdl.Task
	err = db.WithTenant(ctx, s.pool, tn, func(tx pgx.Tx) error {
		if err := checkMembers(ctx, tx, tn.WorkspaceID, req.AssigneeIDs, "assigneeIds"); err != nil {
			return err
		}
		if err := checkLabels(ctx, tx, tn.WorkspaceID, req.LabelIDs); err != nil {
			return err
		}
		var id string
		if err := tx.QueryRow(ctx, `
			INSERT INTO tasks (workspace_id, title, description, status, priority, start_date, end_date, due_date, created_by)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
			tn.WorkspaceID, v.Title, v.Description, v.Status, v.Priority, v.StartDate, v.EndDate, v.DueDate, tn.UserID,
		).Scan(&id); err != nil {
			return err
		}
		if err := replaceSet(ctx, tx, "task_assignees", "user_id", tn.WorkspaceID, id, req.AssigneeIDs); err != nil {
			return err
		}
		if err := replaceSet(ctx, tx, "task_labels", "label_id", tn.WorkspaceID, id, req.LabelIDs); err != nil {
			return err
		}
		task, err = load(ctx, tx, tn.WorkspaceID, id, false)
		return err
	})
	if err != nil {
		return mdl.Task{}, mdl.Viewer{}, wrap("create", err)
	}
	s.log.Info("task_created", "workspace_id", tn.WorkspaceID, "task_id", task.ID, "user_id", tn.UserID)
	return task, Evaluate(accessOf(task), tn.UserID), nil
}

// Update applies the present fields if ifMatch equals the current version.
func (s *TaskSvc) Update(ctx context.Context, tn db.Tenant, id, ifMatch string, req mdl.UpdateTaskReq) (mdl.Task, mdl.Viewer, error) {
	expected, err := parseETag(ifMatch)
	if err != nil {
		return mdl.Task{}, mdl.Viewer{}, err
	}
	var task mdl.Task
	err = db.WithTenant(ctx, s.pool, tn, func(tx pgx.Tx) error {
		cur, err := load(ctx, tx, tn.WorkspaceID, id, true)
		if err != nil {
			return err
		}
		if err := Authorize(accessOf(cur), tn.UserID, ActionUpdate); err != nil {
			return err
		}
		if cur.Version != expected {
			return ErrStale
		}
		merged := fields{
			Title: cur.Title, Description: cur.Description, Status: cur.Status, Priority: cur.Priority,
			StartDate: cur.StartDate.Format(mdl.DateLayout), EndDate: cur.EndDate.Format(mdl.DateLayout),
		}
		if cur.DueDate != nil {
			d := cur.DueDate.Format(mdl.DateLayout)
			merged.DueDate = &d
		}
		if req.Title.Set {
			merged.Title = req.Title.Value
		}
		if req.Description.Set {
			merged.Description = req.Description.Value
		}
		if req.Status.Set {
			merged.Status = req.Status.Value
		}
		if req.Priority.Set {
			merged.Priority = req.Priority.Value
		}
		if req.StartDate.Set {
			merged.StartDate = req.StartDate.Value
		}
		if req.EndDate.Set {
			merged.EndDate = req.EndDate.Value
		}
		if req.DueDate.Set {
			merged.DueDate = req.DueDate.Value
		}
		v, err := validate(merged)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE tasks SET title = $3, description = $4, status = $5, priority = $6,
			       start_date = $7, end_date = $8, due_date = $9, version = version + 1, updated_at = now()
			 WHERE id = $1 AND workspace_id = $2`,
			id, tn.WorkspaceID, v.Title, v.Description, v.Status, v.Priority, v.StartDate, v.EndDate, v.DueDate); err != nil {
			return err
		}
		task, err = load(ctx, tx, tn.WorkspaceID, id, false)
		return err
	})
	if err != nil {
		return mdl.Task{}, mdl.Viewer{}, wrap("update", err)
	}
	s.log.Info("task_updated", "workspace_id", tn.WorkspaceID, "task_id", id, "user_id", tn.UserID, "version", task.Version)
	return task, Evaluate(accessOf(task), tn.UserID), nil
}

// Set kinds for SetMembers.
type Set int

const (
	SetAssignees Set = iota
	SetOwners
	SetLabels
)

// ReplaceSet replaces a task's assignees, owners or labels.
func (s *TaskSvc) ReplaceSet(ctx context.Context, tn db.Tenant, id string, kind Set, ids []string) (mdl.Task, mdl.Viewer, error) {
	ids = dedupe(ids)
	var task mdl.Task
	err := db.WithTenant(ctx, s.pool, tn, func(tx pgx.Tx) error {
		cur, err := load(ctx, tx, tn.WorkspaceID, id, true)
		if err != nil {
			return err
		}
		switch kind {
		case SetAssignees:
			if err := Authorize(accessOf(cur), tn.UserID, ActionSetAssignees); err != nil {
				return err
			}
			if err := checkMembers(ctx, tx, tn.WorkspaceID, ids, "userIds"); err != nil {
				return err
			}
			err = replaceSet(ctx, tx, "task_assignees", "user_id", tn.WorkspaceID, id, ids)
		case SetOwners:
			if err := Authorize(accessOf(cur), tn.UserID, ActionSetOwners); err != nil {
				return err
			}
			// The creator already manages the task and is never listed as an owner.
			ids = slices.DeleteFunc(ids, func(uid string) bool { return uid == cur.CreatedBy.ID })
			if err := checkMembers(ctx, tx, tn.WorkspaceID, ids, "userIds"); err != nil {
				return err
			}
			err = replaceSet(ctx, tx, "task_owners", "user_id", tn.WorkspaceID, id, ids)
		case SetLabels:
			if err := Authorize(accessOf(cur), tn.UserID, ActionSetLabels); err != nil {
				return err
			}
			if err := checkLabels(ctx, tx, tn.WorkspaceID, ids); err != nil {
				return err
			}
			err = replaceSet(ctx, tx, "task_labels", "label_id", tn.WorkspaceID, id, ids)
		}
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE tasks SET version = version + 1, updated_at = now() WHERE id = $1`, id); err != nil {
			return err
		}
		task, err = load(ctx, tx, tn.WorkspaceID, id, false)
		return err
	})
	if err != nil {
		return mdl.Task{}, mdl.Viewer{}, wrap("replace_set", err)
	}
	return task, Evaluate(accessOf(task), tn.UserID), nil
}

// Delete removes a task (manage permission).
func (s *TaskSvc) Delete(ctx context.Context, tn db.Tenant, id string) error {
	err := db.WithTenant(ctx, s.pool, tn, func(tx pgx.Tx) error {
		cur, err := load(ctx, tx, tn.WorkspaceID, id, true)
		if err != nil {
			return err
		}
		if err := Authorize(accessOf(cur), tn.UserID, ActionDelete); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `DELETE FROM tasks WHERE id = $1 AND workspace_id = $2`, id, tn.WorkspaceID)
		return err
	})
	if err != nil {
		return wrap("delete", err)
	}
	s.log.Info("task_deleted", "workspace_id", tn.WorkspaceID, "task_id", id, "user_id", tn.UserID)
	return nil
}

// --- helpers ---

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

// ETag formats a version as a strong ETag.
func ETag(version int) string { return `"` + strconv.Itoa(version) + `"` }

func parseETag(v string) (int, error) {
	v = strings.TrimPrefix(strings.TrimSpace(v), "W/")
	if v == "" {
		return 0, ErrMissingIfMatch
	}
	n, err := strconv.Atoi(strings.Trim(v, `"`))
	if err != nil {
		return 0, ErrMissingIfMatch
	}
	return n, nil
}

// wrap keeps apperr kinds intact and adds context to everything else.
func wrap(op string, err error) error {
	var (
		v *apperr.Validation
		n *apperr.NotFound
		f *apperr.Forbidden
		c *apperr.Conflict
		p *apperr.Precondition
	)
	if errors.As(err, &v) || errors.As(err, &n) || errors.As(err, &f) || errors.As(err, &c) || errors.As(err, &p) {
		return err
	}
	return fmt.Errorf("tasksvc: %s: %w", op, err)
}
