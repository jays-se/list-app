package tasksvc

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"

	"github.com/intellicars/list-app/apps/api/internal/apperr"
	"github.com/intellicars/list-app/apps/api/internal/db"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/task/taskmdl"
	"github.com/intellicars/list-app/apps/api/internal/outbox"
	"github.com/intellicars/list-app/apps/api/internal/uuidx"
)

var (
	ErrItemNotFound    = &apperr.NotFound{Detail: "This checklist item no longer exists."}
	MsgItemTitle       = "Checklist item needs a title"
	MsgItemTitleLong   = "Checklist item must be 200 characters or fewer"
	MsgCommentRequired = "Write a comment first"
	MsgCommentTooLong  = "Comments must be 5,000 characters or fewer"
)

func dbTenant(ctx context.Context, s *TaskSvc, tn Caller, fn func(pgx.Tx) error) error {
	return db.WithTenant(ctx, s.pool, tn.Tenant, fn)
}

// taskForChecklistItem resolves an item to its (locked) task.
func taskForItem(ctx context.Context, tx pgx.Tx, workspaceID, itemID string) (mdl.Task, error) {
	if !uuidx.Valid(itemID) {
		return mdl.Task{}, ErrItemNotFound
	}
	var taskID string
	err := tx.QueryRow(ctx, `SELECT task_id FROM checklist_items WHERE id = $1 AND workspace_id = $2`, itemID, workspaceID).Scan(&taskID)
	if errors.Is(err, pgx.ErrNoRows) {
		return mdl.Task{}, ErrItemNotFound
	}
	if err != nil {
		return mdl.Task{}, err
	}
	return load(ctx, tx, workspaceID, taskID, true)
}

func validItemTitle(title string) (string, error) {
	title = strings.TrimSpace(title)
	switch n := utf8.RuneCountInString(title); {
	case n == 0:
		return "", apperr.Field("title", MsgItemTitle)
	case n > 200:
		return "", apperr.Field("title", MsgItemTitleLong)
	}
	return title, nil
}

func loadItem(ctx context.Context, tx pgx.Tx, itemID string) (mdl.ChecklistItem, error) {
	var it mdl.ChecklistItem
	var assignee *mdl.Person
	var aID, aName *string
	var aImage *string
	err := tx.QueryRow(ctx, `
		SELECT c.id, c.title, c.done, u.id, u.name, u.image_url
		  FROM checklist_items c LEFT JOIN users u ON u.id = c.assignee_id WHERE c.id = $1`, itemID).
		Scan(&it.ID, &it.Title, &it.Done, &aID, &aName, &aImage)
	if aID != nil {
		assignee = &mdl.Person{ID: *aID, Name: deref(aName), Image: aImage}
	}
	it.Assignee = assignee
	return it, err
}

func memberName(ctx context.Context, tx pgx.Tx, workspaceID, userID string) (string, error) {
	if !uuidx.Valid(userID) {
		return "", apperr.Field("assigneeId", "Choose someone from this workspace")
	}
	var name string
	err := tx.QueryRow(ctx, `
		SELECT u.name FROM memberships m JOIN users u ON u.id = m.user_id
		 WHERE m.workspace_id = $1 AND m.user_id = $2`, workspaceID, userID).Scan(&name)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", apperr.Field("assigneeId", "Choose someone from this workspace")
	}
	return name, err
}

// AddChecklistItem appends an item (manage permission).
func (s *TaskSvc) AddChecklistItem(ctx context.Context, tn Caller, taskID string, req mdl.CreateChecklistItemReq) (mdl.ChecklistItem, error) {
	var item mdl.ChecklistItem
	err := dbTenant(ctx, s, tn, func(tx pgx.Tx) error {
		task, err := load(ctx, tx, tn.WorkspaceID, taskID, true)
		if err != nil {
			return err
		}
		if err := Authorize(accessOf(task, tn), tn.UserID, ActionUpdate); err != nil {
			return err
		}
		id, err := addChecklistItemTx(ctx, tx, tn, taskID, req)
		if err != nil {
			return err
		}
		item, err = loadItem(ctx, tx, id)
		return err
	})
	return item, wrap("checklist_add", err)
}

func addChecklistItemTx(ctx context.Context, tx pgx.Tx, tn Caller, taskID string, req mdl.CreateChecklistItemReq) (string, error) {
	title, err := validItemTitle(req.Title)
	if err != nil {
		return "", err
	}
	var assignee *string
	events := []event{{Kind: EvChecklistAdded, Subject: title}}
	if req.AssigneeID != nil && *req.AssigneeID != "" {
		name, err := memberName(ctx, tx, tn.WorkspaceID, *req.AssigneeID)
		if err != nil {
			return "", err
		}
		assignee = req.AssigneeID
		events = append(events, event{Kind: EvChecklistAssigned, Subject: title, To: name})
	}
	var id string
	if err := tx.QueryRow(ctx, `
		INSERT INTO checklist_items (workspace_id, task_id, title, assignee_id, position)
		VALUES ($1, $2, $3, $4, coalesce((SELECT max(position) + 1 FROM checklist_items WHERE task_id = $2), 0))
		RETURNING id`, tn.WorkspaceID, taskID, title, assignee).Scan(&id); err != nil {
		return "", err
	}
	return id, emit(ctx, tx, tn, taskID, events...)
}

// UpdateChecklistItem checks/unchecks, renames or (un)assigns an item.
func (s *TaskSvc) UpdateChecklistItem(ctx context.Context, tn Caller, itemID string, req mdl.UpdateChecklistItemReq) (mdl.ChecklistItem, error) {
	var item mdl.ChecklistItem
	err := dbTenant(ctx, s, tn, func(tx pgx.Tx) error {
		task, err := taskForItem(ctx, tx, tn.WorkspaceID, itemID)
		if err != nil {
			return err
		}
		if err := Authorize(accessOf(task, tn), tn.UserID, ActionUpdate); err != nil {
			return err
		}
		if err := updateChecklistItemTx(ctx, tx, tn, task.ID, itemID, req); err != nil {
			return err
		}
		item, err = loadItem(ctx, tx, itemID)
		return err
	})
	return item, wrap("checklist_update", err)
}

func updateChecklistItemTx(ctx context.Context, tx pgx.Tx, tn Caller, taskID, itemID string, req mdl.UpdateChecklistItemReq) error {
	cur, err := loadItem(ctx, tx, itemID)
	if err != nil {
		return err
	}
	next := cur
	var events []event
	if req.Title.Set {
		if next.Title, err = validItemTitle(req.Title.Value); err != nil {
			return err
		}
		if next.Title != cur.Title {
			events = append(events, event{Kind: EvChecklistRenamed, From: cur.Title, To: next.Title})
		}
	}
	if req.Done.Set && req.Done.Value != cur.Done {
		next.Done = req.Done.Value
		kind := EvChecklistUnchk
		if next.Done {
			kind = EvChecklistChecked
		}
		events = append(events, event{Kind: kind, Subject: next.Title})
	}
	assigneeID := (*string)(nil)
	if cur.Assignee != nil {
		assigneeID = &cur.Assignee.ID
	}
	if req.AssigneeID.Set {
		newID := req.AssigneeID.Value
		switch {
		case newID == nil || *newID == "":
			if cur.Assignee != nil {
				events = append(events, event{Kind: EvChecklistUnassign, Subject: next.Title, From: cur.Assignee.Name})
			}
			assigneeID = nil
		case cur.Assignee == nil || cur.Assignee.ID != *newID:
			name, err := memberName(ctx, tx, tn.WorkspaceID, *newID)
			if err != nil {
				return err
			}
			events = append(events, event{Kind: EvChecklistAssigned, Subject: next.Title, To: name})
			assigneeID = newID
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE checklist_items SET title = $2, done = $3, assignee_id = $4 WHERE id = $1`,
		itemID, next.Title, next.Done, assigneeID); err != nil {
		return err
	}
	return emit(ctx, tx, tn, taskID, events...)
}

func (s *TaskSvc) DeleteChecklistItem(ctx context.Context, tn Caller, itemID string) error {
	err := dbTenant(ctx, s, tn, func(tx pgx.Tx) error {
		task, err := taskForItem(ctx, tx, tn.WorkspaceID, itemID)
		if err != nil {
			return err
		}
		if err := Authorize(accessOf(task, tn), tn.UserID, ActionUpdate); err != nil {
			return err
		}
		return deleteChecklistItemTx(ctx, tx, tn, task.ID, itemID)
	})
	return wrap("checklist_delete", err)
}

func deleteChecklistItemTx(ctx context.Context, tx pgx.Tx, tn Caller, taskID, itemID string) error {
	var title string
	if err := tx.QueryRow(ctx, `DELETE FROM checklist_items WHERE id = $1 RETURNING title`, itemID).Scan(&title); err != nil {
		return err
	}
	return emit(ctx, tx, tn, taskID, event{Kind: EvChecklistRemoved, Subject: title})
}

// AddComment posts a comment (any member may comment). Mentions must be
// members of the workspace; they drive MENTION notifications (E9).
func (s *TaskSvc) AddComment(ctx context.Context, tn Caller, taskID string, req mdl.CreateCommentReq) (mdl.Comment, error) {
	body := strings.TrimSpace(req.Body)
	switch n := utf8.RuneCountInString(body); {
	case n == 0:
		return mdl.Comment{}, apperr.Field("body", MsgCommentRequired)
	case n > 5000:
		return mdl.Comment{}, apperr.Field("body", MsgCommentTooLong)
	}
	mentions := dedupe(req.MentionedUserIDs)
	var comment mdl.Comment
	err := dbTenant(ctx, s, tn, func(tx pgx.Tx) error {
		if _, err := load(ctx, tx, tn.WorkspaceID, taskID, false); err != nil {
			return err
		}
		if err := checkMembers(ctx, tx, tn.WorkspaceID, mentions, "mentionedUserIds"); err != nil {
			return err
		}
		var id string
		if err := tx.QueryRow(ctx, `INSERT INTO comments (workspace_id, task_id, author_id, body) VALUES ($1, $2, $3, $4) RETURNING id`,
			tn.WorkspaceID, taskID, tn.UserID, body).Scan(&id); err != nil {
			return err
		}
		if len(mentions) > 0 {
			if _, err := tx.Exec(ctx, `INSERT INTO comment_mentions (workspace_id, comment_id, user_id)
				SELECT $1, $2, x::uuid FROM unnest($3::text[]) AS x`, tn.WorkspaceID, id, mentions); err != nil {
				return err
			}
		}
		if err := emit(ctx, tx, tn, taskID, event{Kind: EvCommented, Subject: truncate(body, 120)}); err != nil {
			return err
		}
		if len(mentions) > 0 {
			if err := outbox.Emit(ctx, tx, tn.WorkspaceID, outbox.KindCommentMentioned,
				outbox.CommentMentioned{TaskID: taskID, ActorID: tn.UserID, CommentID: id, UserIDs: mentions}); err != nil {
				return err
			}
		}
		task, err := loadDetail(ctx, tx, tn.WorkspaceID, taskID)
		if err != nil {
			return err
		}
		for _, c := range task.Comments {
			if c.ID == id {
				comment = c
			}
		}
		return nil
	})
	if err != nil {
		return mdl.Comment{}, wrap("comment_add", err)
	}
	s.log.Info("comment_added", "workspace_id", tn.WorkspaceID, "task_id", taskID, "mentions", len(mentions))
	return comment, nil
}

// History returns events (newest first) and status stages (oldest first).
// Actors who left the workspace are returned as null ("a former member").
func (s *TaskSvc) History(ctx context.Context, tn Caller, taskID string) (mdl.HistoryRsp, error) {
	out := mdl.HistoryRsp{Events: []mdl.Event{}, Stages: []mdl.Stage{}}
	err := dbTenant(ctx, s, tn, func(tx pgx.Tx) error {
		if _, err := load(ctx, tx, tn.WorkspaceID, taskID, false); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `
			SELECT e.id, e.kind, e.field, e.from_value, e.to_value, e.subject, e.created_at,
			       CASE WHEN m.user_id IS NULL THEN NULL ELSE u.id::text END, u.name, u.image_url
			  FROM task_events e
			  LEFT JOIN users u ON u.id = e.actor_id
			  LEFT JOIN memberships m ON m.user_id = e.actor_id AND m.workspace_id = e.workspace_id
			 WHERE e.task_id = $1
			 ORDER BY e.created_at DESC, e.id DESC
			 LIMIT 500`, taskID)
		if err != nil {
			return err
		}
		out.Events, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (mdl.Event, error) {
			var e mdl.Event
			var actorID, name, image *string
			if err := r.Scan(&e.ID, &e.Kind, &e.Field, &e.From, &e.To, &e.Subject, &e.CreatedAt, &actorID, &name, &image); err != nil {
				return e, err
			}
			if actorID != nil {
				e.Actor = &mdl.Person{ID: *actorID, Name: deref(name), Image: image}
			}
			return e, nil
		})
		if err != nil {
			return err
		}
		rows, err = tx.Query(ctx, `SELECT status, entered_at, left_at FROM task_status_stages WHERE task_id = $1 ORDER BY entered_at, id`, taskID)
		if err != nil {
			return err
		}
		out.Stages, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (mdl.Stage, error) {
			var st mdl.Stage
			return st, r.Scan(&st.Status, &st.EnteredAt, &st.LeftAt)
		})
		return err
	})
	if err != nil {
		return mdl.HistoryRsp{}, wrap("history", err)
	}
	return out, nil
}
