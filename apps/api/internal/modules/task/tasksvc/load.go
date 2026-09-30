package tasksvc

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	mdl "github.com/intellicars/list-app/apps/api/internal/modules/task/taskmdl"
	"github.com/intellicars/list-app/apps/api/internal/uuidx"
)

// taskSelect loads a task with people, labels, client, parent and counts
// as JSON aggregates (one row per task, no N+1).
const taskSelect = `
SELECT t.id, t.title, t.description, t.status, t.priority, t.start_date, t.end_date, t.due_date,
       t.created_at, t.updated_at, t.version,
       json_build_object('id', cu.id, 'name', cu.name, 'image', cu.image_url),
       coalesce((SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'image', u.image_url) ORDER BY lower(u.name), u.id)
                   FROM task_assignees a JOIN users u ON u.id = a.user_id WHERE a.task_id = t.id), '[]'),
       coalesce((SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'image', u.image_url) ORDER BY lower(u.name), u.id)
                   FROM task_owners o JOIN users u ON u.id = o.user_id WHERE o.task_id = t.id), '[]'),
       coalesce((SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color) ORDER BY lower(l.name), l.id)
                   FROM task_labels tl JOIN labels l ON l.id = tl.label_id WHERE tl.task_id = t.id), '[]'),
       CASE WHEN cl.id IS NULL THEN NULL ELSE json_build_object('id', cl.id, 'name', cl.name, 'color', cl.color) END,
       CASE WHEN p.id IS NULL THEN NULL ELSE json_build_object('id', p.id, 'title', p.title, 'status', p.status) END,
       json_build_object(
         'subtasks', (SELECT count(*) FROM tasks s WHERE s.parent_id = t.id),
         'subtasksDone', (SELECT count(*) FROM tasks s WHERE s.parent_id = t.id AND s.status = 'DONE'),
         'checklist', (SELECT count(*) FROM checklist_items c WHERE c.task_id = t.id),
         'checklistDone', (SELECT count(*) FROM checklist_items c WHERE c.task_id = t.id AND c.done),
         'comments', (SELECT count(*) FROM comments m WHERE m.task_id = t.id),
         'attachments', (SELECT count(*) FROM attachments f WHERE f.task_id = t.id AND f.status = 'READY'))
  FROM tasks t
  JOIN users cu ON cu.id = t.created_by
  LEFT JOIN clients cl ON cl.id = t.client_id
  LEFT JOIN tasks p ON p.id = t.parent_id`

func scanTask(row pgx.Row) (mdl.Task, error) {
	var t mdl.Task
	var client, parent []byte
	err := row.Scan(&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority, &t.StartDate, &t.EndDate, &t.DueDate,
		&t.CreatedAt, &t.UpdatedAt, &t.Version, &t.CreatedBy, &t.Assignees, &t.Owners, &t.Labels, &client, &parent, &t.Counts)
	if err != nil {
		return t, err
	}
	if client != nil {
		t.Client = &mdl.ClientRef{}
		if err := json.Unmarshal(client, t.Client); err != nil {
			return t, err
		}
	}
	if parent != nil {
		t.Parent = &mdl.TaskRef{}
		if err := json.Unmarshal(parent, t.Parent); err != nil {
			return t, err
		}
	}
	return t, nil
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

// loadDetail adds subtasks, checklist, comments and attachments.
func loadDetail(ctx context.Context, tx pgx.Tx, workspaceID, id string) (mdl.Task, error) {
	t, err := load(ctx, tx, workspaceID, id, false)
	if err != nil {
		return t, err
	}
	if err := tx.QueryRow(ctx, `
		SELECT
		  coalesce((SELECT json_agg(json_build_object('id', s.id, 'title', s.title, 'status', s.status) ORDER BY s.created_at, s.id)
		              FROM tasks s WHERE s.parent_id = $1), '[]'),
		  coalesce((SELECT json_agg(json_build_object('id', c.id, 'title', c.title, 'done', c.done,
		              'assignee', CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name, 'image', u.image_url) END)
		              ORDER BY c.position, c.id)
		              FROM checklist_items c LEFT JOIN users u ON u.id = c.assignee_id WHERE c.task_id = $1), '[]'),
		  coalesce((SELECT json_agg(json_build_object('id', m.id, 'body', m.body, 'createdAt', m.created_at,
		              'author', CASE WHEN u.id IS NULL OR ms.user_id IS NULL THEN NULL
		                             ELSE json_build_object('id', u.id, 'name', u.name, 'image', u.image_url) END,
		              'mentions', coalesce((SELECT json_agg(json_build_object('id', mu.id, 'name', mu.name, 'image', mu.image_url) ORDER BY lower(mu.name))
		                                      FROM comment_mentions cm JOIN users mu ON mu.id = cm.user_id WHERE cm.comment_id = m.id), '[]'))
		              ORDER BY m.created_at, m.id)
		              FROM comments m
		              LEFT JOIN users u ON u.id = m.author_id
		              LEFT JOIN memberships ms ON ms.user_id = m.author_id AND ms.workspace_id = m.workspace_id
		             WHERE m.task_id = $1), '[]'),
		  coalesce((SELECT json_agg(json_build_object('id', f.id, 'filename', f.filename, 'mimeType', f.mime_type, 'size', f.size,
		              'createdAt', f.created_at, 'downloadUrl', '/api/v1/attachments/' || f.id,
		              'uploadedBy', CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name, 'image', u.image_url) END)
		              ORDER BY f.created_at, f.id)
		              FROM attachments f LEFT JOIN users u ON u.id = f.uploaded_by WHERE f.task_id = $1 AND f.status = 'READY'), '[]')`,
		id).Scan(&t.Subtasks, &t.Checklist, &t.Comments, &t.Attachments); err != nil {
		return t, fmt.Errorf("tasksvc: load detail: %w", err)
	}
	return t, nil
}
