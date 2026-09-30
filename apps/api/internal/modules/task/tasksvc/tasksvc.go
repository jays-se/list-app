// Package tasksvc implements tasks: list with filters, CRUD, subtasks,
// clients, assignees/owners/labels (E4), checklist, comments, attachments
// (E4-S7..S9), history (E6), the permission policy (E5-S1, ADR-0020/0021)
// and optimistic concurrency. Everything runs in db.WithTenant (RLS), and
// every change writes its history events in the same transaction.
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
	"github.com/intellicars/list-app/apps/api/internal/blobstore"
	"github.com/intellicars/list-app/apps/api/internal/db"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/task/taskmdl"
	"github.com/intellicars/list-app/apps/api/internal/uuidx"
)

var (
	ErrNotFound       = &apperr.NotFound{Detail: "This task no longer exists."}
	ErrStale          = &apperr.Conflict{Type: "conflict", Detail: "Someone else changed this task. Reload to see the latest version."}
	ErrMissingIfMatch = &apperr.Precondition{Detail: "Send If-Match with the task version you edited."}
)

// Caller is who acts: the tenant (for RLS) plus their workspace role.
type Caller struct {
	db.Tenant
	Role string
}

type TaskSvc struct {
	pool  *pgxpool.Pool
	blobs blobstore.Store
	log   *slog.Logger
}

func NewTaskSvc(pool *pgxpool.Pool, blobs blobstore.Store, log *slog.Logger) *TaskSvc {
	return &TaskSvc{pool: pool, blobs: blobs, log: log}
}

// List returns the workspace's tasks, due date first (no date last), then newest.
func (s *TaskSvc) List(ctx context.Context, tn Caller, f mdl.Filter) ([]mdl.Task, error) {
	if f.Status != "" && !slices.Contains(mdl.Statuses, f.Status) {
		return nil, apperr.Field("status", MsgUnknownStatus)
	}
	for _, id := range []string{f.AssigneeID, f.LabelID, f.ClientID, f.ParentID} {
		if id != "" && !uuidx.Valid(id) {
			return []mdl.Task{}, nil // unknown ids simply match nothing
		}
	}
	var tasks []mdl.Task
	err := db.WithTenant(ctx, s.pool, tn.Tenant, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, taskSelect+`
		 WHERE t.workspace_id = $1
		   AND ($2 = '' OR t.status = $2)
		   AND ($3 = '' OR EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id = t.id AND a.user_id::text = $3))
		   AND ($4 = '' OR EXISTS (SELECT 1 FROM task_labels tl WHERE tl.task_id = t.id AND tl.label_id::text = $4))
		   AND ($5 = '' OR t.client_id::text = $5)
		   AND ($6 = '' OR t.parent_id::text = $6)
		 ORDER BY t.due_date NULLS LAST, t.created_at DESC, t.id
		 LIMIT 5000`, tn.WorkspaceID, f.Status, f.AssigneeID, f.LabelID, f.ClientID, f.ParentID)
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

// Get returns one task (with subtasks, checklist, comments, attachments)
// and the caller's permissions.
func (s *TaskSvc) Get(ctx context.Context, tn Caller, id string) (mdl.Task, mdl.Viewer, error) {
	var task mdl.Task
	err := db.WithTenant(ctx, s.pool, tn.Tenant, func(tx pgx.Tx) error {
		var err error
		task, err = loadDetail(ctx, tx, tn.WorkspaceID, id)
		return err
	})
	if err != nil {
		return mdl.Task{}, mdl.Viewer{}, wrap("get", err)
	}
	return task, Evaluate(accessOf(task, tn), tn.UserID), nil
}

// Create inserts a task (or a subtask when ParentID is set).
func (s *TaskSvc) Create(ctx context.Context, tn Caller, req mdl.CreateTaskReq) (mdl.Task, mdl.Viewer, error) {
	v, err := validate(fields{
		Title: req.Title, Description: req.Description,
		Status: orDefault(req.Status, "TODO"), Priority: orDefault(req.Priority, "NONE"),
		StartDate: req.StartDate, EndDate: req.EndDate, DueDate: req.DueDate,
	})
	if err != nil {
		return mdl.Task{}, mdl.Viewer{}, err
	}
	var task mdl.Task
	err = db.WithTenant(ctx, s.pool, tn.Tenant, func(tx pgx.Tx) error {
		if err := checkMembers(ctx, tx, tn.WorkspaceID, req.AssigneeIDs, "assigneeIds"); err != nil {
			return err
		}
		if err := checkLabels(ctx, tx, tn.WorkspaceID, req.LabelIDs); err != nil {
			return err
		}
		clientID, _, err := checkClient(ctx, tx, tn.WorkspaceID, req.ClientID)
		if err != nil {
			return err
		}
		var parentID *string
		if req.ParentID != nil && *req.ParentID != "" {
			parent, err := load(ctx, tx, tn.WorkspaceID, *req.ParentID, true)
			if errors.Is(err, ErrNotFound) {
				return apperr.Field("parentId", "The parent task no longer exists")
			}
			if err != nil {
				return err
			}
			if parent.Parent != nil {
				return apperr.Field("parentId", "Subtasks can't have subtasks")
			}
			if err := Authorize(accessOf(parent, tn), tn.UserID, ActionUpdate); err != nil {
				return err
			}
			parentID = &parent.ID
		}
		var id string
		if err := tx.QueryRow(ctx, `
			INSERT INTO tasks (workspace_id, title, description, status, priority, start_date, end_date, due_date, created_by, client_id, parent_id)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
			tn.WorkspaceID, v.Title, v.Description, v.Status, v.Priority, v.StartDate, v.EndDate, v.DueDate, tn.UserID, clientID, parentID,
		).Scan(&id); err != nil {
			return err
		}
		if err := replaceSet(ctx, tx, "task_assignees", "user_id", tn.WorkspaceID, id, req.AssigneeIDs); err != nil {
			return err
		}
		if err := replaceSet(ctx, tx, "task_labels", "label_id", tn.WorkspaceID, id, req.LabelIDs); err != nil {
			return err
		}
		if err := enterStatus(ctx, tx, tn.WorkspaceID, id, v.Status); err != nil {
			return err
		}
		if err := emit(ctx, tx, tn, id, event{Kind: EvCreated}); err != nil {
			return err
		}
		if parentID != nil {
			if err := emit(ctx, tx, tn, *parentID, event{Kind: EvSubtaskAdded, Subject: truncate(v.Title, 120)}); err != nil {
				return err
			}
		}
		task, err = loadDetail(ctx, tx, tn.WorkspaceID, id)
		return err
	})
	if err != nil {
		return mdl.Task{}, mdl.Viewer{}, wrap("create", err)
	}
	s.log.Info("task_created", "workspace_id", tn.WorkspaceID, "task_id", task.ID, "user_id", tn.UserID)
	return task, Evaluate(accessOf(task, tn), tn.UserID), nil
}

// Update applies the present fields if ifMatch equals the current version.
func (s *TaskSvc) Update(ctx context.Context, tn Caller, id, ifMatch string, req mdl.UpdateTaskReq) (mdl.Task, mdl.Viewer, error) {
	expected, err := parseETag(ifMatch)
	if err != nil {
		return mdl.Task{}, mdl.Viewer{}, err
	}
	var task mdl.Task
	err = db.WithTenant(ctx, s.pool, tn.Tenant, func(tx pgx.Tx) error {
		cur, err := load(ctx, tx, tn.WorkspaceID, id, true)
		if err != nil {
			return err
		}
		if err := Authorize(accessOf(cur, tn), tn.UserID, ActionUpdate); err != nil {
			return err
		}
		if cur.Version != expected {
			return ErrStale
		}
		before := fieldsOf(cur)
		merged := before
		apply(&merged, req)
		v, err := validate(merged)
		if err != nil {
			return err
		}
		clientID := clientIDOf(cur)
		clientName := ""
		if cur.Client != nil {
			clientName = cur.Client.Name
		}
		newClientName := clientName
		if req.ClientID.Set {
			clientID, newClientName, err = checkClient(ctx, tx, tn.WorkspaceID, req.ClientID.Value)
			if err != nil {
				return err
			}
		}
		if _, err := tx.Exec(ctx, `
			UPDATE tasks SET title = $3, description = $4, status = $5, priority = $6,
			       start_date = $7, end_date = $8, due_date = $9, client_id = $10,
			       version = version + 1, updated_at = now()
			 WHERE id = $1 AND workspace_id = $2`,
			id, tn.WorkspaceID, v.Title, v.Description, v.Status, v.Priority, v.StartDate, v.EndDate, v.DueDate, clientID); err != nil {
			return err
		}
		events := changeEvents(before, fieldsOf(mdl.Task{
			Title: v.Title, Description: v.Description, Status: v.Status, Priority: v.Priority,
			StartDate: v.StartDate, EndDate: v.EndDate, DueDate: v.DueDate,
		}))
		if clientName != newClientName {
			events = append(events, event{Kind: EvUpdated, Field: "client", From: clientName, To: newClientName})
		}
		if cur.Status != v.Status {
			if err := enterStatus(ctx, tx, tn.WorkspaceID, id, v.Status); err != nil {
				return err
			}
		}
		if err := emit(ctx, tx, tn, id, events...); err != nil {
			return err
		}
		task, err = loadDetail(ctx, tx, tn.WorkspaceID, id)
		return err
	})
	if err != nil {
		return mdl.Task{}, mdl.Viewer{}, wrap("update", err)
	}
	s.log.Info("task_updated", "workspace_id", tn.WorkspaceID, "task_id", id, "user_id", tn.UserID, "version", task.Version)
	return task, Evaluate(accessOf(task, tn), tn.UserID), nil
}

func fieldsOf(t mdl.Task) fields {
	f := fields{
		Title: t.Title, Description: t.Description, Status: t.Status, Priority: t.Priority,
		StartDate: t.StartDate.Format(mdl.DateLayout), EndDate: t.EndDate.Format(mdl.DateLayout),
	}
	if t.DueDate != nil {
		d := t.DueDate.Format(mdl.DateLayout)
		f.DueDate = &d
	}
	return f
}

func apply(f *fields, req mdl.UpdateTaskReq) {
	if req.Title.Set {
		f.Title = req.Title.Value
	}
	if req.Description.Set {
		f.Description = req.Description.Value
	}
	if req.Status.Set {
		f.Status = req.Status.Value
	}
	if req.Priority.Set {
		f.Priority = req.Priority.Value
	}
	if req.StartDate.Set {
		f.StartDate = req.StartDate.Value
	}
	if req.EndDate.Set {
		f.EndDate = req.EndDate.Value
	}
	if req.DueDate.Set {
		f.DueDate = req.DueDate.Value
	}
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// changeEvents describes what changed between two field sets.
func changeEvents(a, b fields) []event {
	var out []event
	if a.Status != b.Status {
		out = append(out, event{Kind: EvStatus, From: a.Status, To: b.Status})
	}
	for _, c := range []struct{ field, from, to string }{
		{"title", a.Title, b.Title},
		{"description", deref(a.Description), deref(b.Description)},
		{"priority", a.Priority, b.Priority},
		{"startDate", a.StartDate, b.StartDate},
		{"endDate", a.EndDate, b.EndDate},
		{"dueDate", deref(a.DueDate), deref(b.DueDate)},
	} {
		if c.from != c.to {
			out = append(out, event{Kind: EvUpdated, Field: c.field, From: truncate(c.from, 200), To: truncate(c.to, 200)})
		}
	}
	return out
}

func clientIDOf(t mdl.Task) *string {
	if t.Client == nil {
		return nil
	}
	return &t.Client.ID
}

// checkClient validates an optional client id; returns (id or nil, name).
func checkClient(ctx context.Context, tx pgx.Tx, workspaceID string, id *string) (*string, string, error) {
	if id == nil || *id == "" {
		return nil, "", nil
	}
	if !uuidx.Valid(*id) {
		return nil, "", apperr.Field("clientId", "Choose a client from this workspace")
	}
	var name string
	err := tx.QueryRow(ctx, `SELECT name FROM clients WHERE id = $1 AND workspace_id = $2`, *id, workspaceID).Scan(&name)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", apperr.Field("clientId", "Choose a client from this workspace")
	}
	if err != nil {
		return nil, "", err
	}
	return id, name, nil
}

// Delete removes a task and its subtasks (manage permission).
func (s *TaskSvc) Delete(ctx context.Context, tn Caller, id string) error {
	var keys []string
	err := db.WithTenant(ctx, s.pool, tn.Tenant, func(tx pgx.Tx) error {
		cur, err := load(ctx, tx, tn.WorkspaceID, id, true)
		if err != nil {
			return err
		}
		if err := Authorize(accessOf(cur, tn), tn.UserID, ActionDelete); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `
			SELECT storage_key FROM attachments
			 WHERE task_id = $1 OR task_id IN (SELECT id FROM tasks WHERE parent_id = $1)`, id)
		if err != nil {
			return err
		}
		if keys, err = pgx.CollectRows(rows, pgx.RowTo[string]); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `DELETE FROM tasks WHERE id = $1 AND workspace_id = $2`, id, tn.WorkspaceID)
		return err
	})
	if err != nil {
		return wrap("delete", err)
	}
	s.deleteBlobs(ctx, keys)
	s.log.Info("task_deleted", "workspace_id", tn.WorkspaceID, "task_id", id, "user_id", tn.UserID)
	return nil
}

// deleteBlobs is best effort: rows are gone, orphans are only storage cost.
func (s *TaskSvc) deleteBlobs(ctx context.Context, keys []string) {
	for _, k := range keys {
		if err := s.blobs.Delete(ctx, k); err != nil {
			s.log.Warn("blob_delete_failed", "key", k, "error", err)
		}
	}
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
	if err == nil {
		return nil
	}
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
