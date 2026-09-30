package tasksvc

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"

	"github.com/intellicars/list-app/apps/api/internal/apperr"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/task/taskmdl"
	"github.com/intellicars/list-app/apps/api/internal/outbox"
	"github.com/intellicars/list-app/apps/api/internal/uuidx"
)

// Change requests (E5-S2, ADR-0023): assignees who can't manage a task
// propose changes; managers approve (applied through the same *Tx
// functions as direct edits) or reject; requesters may withdraw.

const (
	EvRequestCreated  = "REQUEST_CREATED"
	EvRequestApproved = "REQUEST_APPROVED"
	EvRequestRejected = "REQUEST_REJECTED"
	EvRequestCanceled = "REQUEST_CANCELED"

	MaxNoteLen     = 1000
	MsgNoteTooLong = "Notes must be 1,000 characters or fewer"
	MsgBadKind     = "Choose a valid request type"
	MsgNoChange    = "That's already the current value"
)

var (
	ErrRequestNotFound  = &apperr.NotFound{Detail: "This request no longer exists."}
	ErrRequestStale     = &apperr.Conflict{Type: "request_stale", Detail: "The task changed since this request was made. Reject it and ask for a new one."}
	ErrRequestDuplicate = &apperr.Conflict{Type: "request_duplicate", Detail: "You already asked for this change. Withdraw that request first."}
	ErrNotRequester     = &apperr.Forbidden{Detail: "Only the person who asked can withdraw a request."}
)

func errDecided(status string) error {
	word := map[string]string{"APPROVED": "approved", "REJECTED": "rejected", "CANCELED": "withdrawn"}[status]
	return &apperr.Conflict{Type: "request_decided", Detail: "This request was already " + word + "."}
}

var statusLabel = map[string]string{
	"BACKLOG": "Backlog", "TODO": "To do", "IN_PROGRESS": "In progress",
	"TESTING": "Testing", "DONE": "Done", "CANCELED": "Canceled",
}

var fieldLabel = map[string]string{"status": "status", "startDate": "start date", "endDate": "end date", "dueDate": "due date"}

func quote(s string) string { return "“" + truncate(s, 80) + "”" }

func prettyDate(s string) string {
	if d, err := parseDate(s); err == nil {
		return d.Format("Jan 2, 2006")
	}
	return s
}

func fieldValue(f fields, field string) string {
	switch field {
	case "status":
		return f.Status
	case "startDate":
		return f.StartDate
	case "endDate":
		return f.EndDate
	default:
		return deref(f.DueDate)
	}
}

func validNote(note *string) (*string, error) {
	if note == nil {
		return nil, nil
	}
	n := strings.TrimSpace(*note)
	if n == "" {
		return nil, nil
	}
	if utf8.RuneCountInString(n) > MaxNoteLen {
		return nil, apperr.Field("note", MsgNoteTooLong)
	}
	return &n, nil
}

func str(s string) *string { return &s }

// requestRow is a change request as the engine needs it.
type requestRow struct {
	ID, TaskID, Kind, Status, Summary string
	Payload                           mdl.RequestPayload
	RequesterID                       *string
}

func lockRequest(ctx context.Context, tx pgx.Tx, workspaceID, id string) (requestRow, error) {
	if !uuidx.Valid(id) {
		return requestRow{}, ErrRequestNotFound
	}
	var r requestRow
	err := tx.QueryRow(ctx, `
		SELECT id, task_id, kind, status, summary, payload, requester_id FROM change_requests
		 WHERE id = $1 AND workspace_id = $2 FOR UPDATE`, id, workspaceID).
		Scan(&r.ID, &r.TaskID, &r.Kind, &r.Status, &r.Summary, &r.Payload, &r.RequesterID)
	if errors.Is(err, pgx.ErrNoRows) {
		return requestRow{}, ErrRequestNotFound
	}
	return r, err
}

func checklistItemOf(ctx context.Context, tx pgx.Tx, taskID, itemID string) (mdl.ChecklistItem, bool, error) {
	if !uuidx.Valid(itemID) {
		return mdl.ChecklistItem{}, false, nil
	}
	var it mdl.ChecklistItem
	err := tx.QueryRow(ctx, `SELECT id, title, done FROM checklist_items WHERE id = $1 AND task_id = $2`, itemID, taskID).
		Scan(&it.ID, &it.Title, &it.Done)
	if errors.Is(err, pgx.ErrNoRows) {
		return it, false, nil
	}
	return it, err == nil, err
}

// prepare validates a proposal against the current task and returns the
// normalized payload, its summary, and the payload subset that identifies
// duplicates (same requester, kind and target).
func (s *TaskSvc) prepare(ctx context.Context, tx pgx.Tx, tn Caller, cur mdl.Task, kind string, p mdl.RequestPayload) (mdl.RequestPayload, string, mdl.RequestPayload, error) {
	var none mdl.RequestPayload
	switch kind {
	case "UPDATE":
		field := deref(p.Field)
		if !slices.Contains(mdl.RequestFields, field) {
			return none, "", none, apperr.Field("field", "Choose status, start date, end date or due date")
		}
		value := strings.TrimSpace(deref(p.Value))
		before := fieldsOf(cur)
		merged := before
		switch field {
		case "status":
			merged.Status = value
		case "startDate":
			merged.StartDate = value
		case "endDate":
			merged.EndDate = value
		case "dueDate":
			merged.DueDate = &value
		}
		if _, err := validate(merged); err != nil {
			var v *apperr.Validation
			if errors.As(err, &v) && len(v.Fields) > 0 {
				return none, "", none, apperr.Field("value", v.Fields[0].Message)
			}
			return none, "", none, err
		}
		from := fieldValue(before, field)
		if value == from {
			return none, "", none, apperr.Field("value", MsgNoChange)
		}
		var summary string
		switch {
		case field == "status":
			summary = "Change status to " + statusLabel[value]
		case value == "":
			summary = "Clear " + fieldLabel[field]
		default:
			summary = "Change " + fieldLabel[field] + " to " + prettyDate(value)
		}
		return mdl.RequestPayload{Field: &field, Value: &value, From: &from}, summary, mdl.RequestPayload{Field: &field}, nil
	case "ASSIGNEE_ADD", "ASSIGNEE_REMOVE":
		uid := deref(p.UserID)
		name, err := memberName(ctx, tx, tn.WorkspaceID, uid)
		if err != nil {
			return none, "", none, apperr.Field("userId", "Choose someone from this workspace")
		}
		assigned := slices.ContainsFunc(cur.Assignees, func(x mdl.Person) bool { return x.ID == uid })
		if kind == "ASSIGNEE_ADD" && assigned {
			return none, "", none, apperr.Field("userId", name+" is already assigned")
		}
		if kind == "ASSIGNEE_REMOVE" && !assigned {
			return none, "", none, apperr.Field("userId", name+" isn't assigned")
		}
		verb := "Add"
		if kind == "ASSIGNEE_REMOVE" {
			verb = "Remove"
		}
		return mdl.RequestPayload{UserID: &uid}, verb + " assignee " + name, mdl.RequestPayload{UserID: &uid}, nil
	case "SUBTASK_ADD":
		if cur.Parent != nil {
			return none, "", none, apperr.Field("title", MsgNoNesting)
		}
		title := strings.TrimSpace(deref(p.Title))
		switch n := utf8.RuneCountInString(title); {
		case n == 0:
			return none, "", none, apperr.Field("title", MsgTitleRequired)
		case n > 500:
			return none, "", none, apperr.Field("title", MsgTitleTooLong)
		}
		return mdl.RequestPayload{Title: &title}, "Add subtask " + quote(title), mdl.RequestPayload{Title: &title}, nil
	case "CHECKLIST_ADD":
		title, err := validItemTitle(deref(p.Title))
		if err != nil {
			return none, "", none, err
		}
		return mdl.RequestPayload{Title: &title}, "Add checklist item " + quote(title), mdl.RequestPayload{Title: &title}, nil
	case "CHECKLIST_UPDATE", "CHECKLIST_REMOVE":
		itemID := deref(p.ItemID)
		item, ok, err := checklistItemOf(ctx, tx, cur.ID, itemID)
		if err != nil {
			return none, "", none, err
		}
		if !ok {
			return none, "", none, apperr.Field("itemId", "This checklist item no longer exists")
		}
		key := mdl.RequestPayload{ItemID: &itemID}
		if kind == "CHECKLIST_REMOVE" {
			return key, "Remove checklist item " + quote(item.Title), key, nil
		}
		out := mdl.RequestPayload{ItemID: &itemID}
		var parts []string
		if p.Title != nil {
			title, err := validItemTitle(*p.Title)
			if err != nil {
				return none, "", none, err
			}
			if title != item.Title {
				out.Title = &title
				parts = append(parts, "Rename "+quote(item.Title)+" to "+quote(title))
			}
		}
		if p.Done != nil && *p.Done != item.Done {
			out.Done = p.Done
			if *p.Done {
				parts = append(parts, "Mark "+quote(item.Title)+" done")
			} else {
				parts = append(parts, "Mark "+quote(item.Title)+" not done")
			}
		}
		if len(parts) == 0 {
			return none, "", none, apperr.Field("itemId", MsgNoChange)
		}
		return out, strings.Join(parts, " and "), key, nil
	case "ATTACHMENT_REMOVE":
		aid := deref(p.AttachmentID)
		row, err := s.loadAttachment(ctx, tx, tn.WorkspaceID, aid)
		if errors.Is(err, ErrAttachmentNotFound) || (err == nil && (row.TaskID != cur.ID || row.Status != "READY")) {
			return none, "", none, apperr.Field("attachmentId", "This attachment no longer exists")
		}
		if err != nil {
			return none, "", none, err
		}
		return mdl.RequestPayload{AttachmentID: &aid}, "Remove attachment " + quote(row.Filename), mdl.RequestPayload{AttachmentID: &aid}, nil
	}
	return none, "", none, apperr.Field("kind", MsgBadKind)
}

// CreateRequest records a proposal by an assignee who can't manage the task.
func (s *TaskSvc) CreateRequest(ctx context.Context, tn Caller, taskID string, req mdl.CreateRequestReq) (mdl.Task, mdl.Viewer, error) {
	if !slices.Contains(mdl.RequestKinds, req.Kind) {
		return mdl.Task{}, mdl.Viewer{}, apperr.Field("kind", MsgBadKind)
	}
	note, err := validNote(req.Note)
	if err != nil {
		return mdl.Task{}, mdl.Viewer{}, err
	}
	var task mdl.Task
	err = dbTenant(ctx, s, tn, func(tx pgx.Tx) error {
		cur, err := load(ctx, tx, tn.WorkspaceID, taskID, true)
		if err != nil {
			return err
		}
		if err := Authorize(accessOf(cur, tn), tn.UserID, ActionRequest); err != nil {
			return err
		}
		payload, summary, key, err := s.prepare(ctx, tx, tn, cur, req.Kind, req.Payload)
		if err != nil {
			return err
		}
		keyJSON, _ := json.Marshal(key)
		var dup bool
		if err := tx.QueryRow(ctx, `
			SELECT EXISTS (SELECT 1 FROM change_requests WHERE task_id = $1 AND requester_id = $2
			                  AND kind = $3 AND status = 'PENDING' AND payload @> $4::jsonb)`,
			cur.ID, tn.UserID, req.Kind, string(keyJSON)).Scan(&dup); err != nil {
			return err
		}
		if dup {
			return ErrRequestDuplicate
		}
		payloadJSON, _ := json.Marshal(payload)
		var id string
		if err := tx.QueryRow(ctx, `
			INSERT INTO change_requests (workspace_id, task_id, kind, payload, summary, note, base_version, requester_id)
			VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8) RETURNING id`,
			tn.WorkspaceID, cur.ID, req.Kind, string(payloadJSON), summary, note, cur.Version, tn.UserID).Scan(&id); err != nil {
			return err
		}
		if err := emit(ctx, tx, tn, cur.ID, event{Kind: EvRequestCreated, Subject: summary}); err != nil {
			return err
		}
		if err := outbox.Emit(ctx, tx, tn.WorkspaceID, outbox.KindRequestCreated,
			outbox.RequestCreated{TaskID: cur.ID, ActorID: tn.UserID, RequestID: id, Summary: summary}); err != nil {
			return err
		}
		task, err = loadDetail(ctx, tx, tn.WorkspaceID, cur.ID)
		return err
	})
	if err != nil {
		return mdl.Task{}, mdl.Viewer{}, wrap("request_create", err)
	}
	s.log.Info("request_created", "workspace_id", tn.WorkspaceID, "task_id", taskID, "kind", req.Kind, "user_id", tn.UserID)
	return task, Evaluate(accessOf(task, tn), tn.UserID), nil
}

// loadRequests returns a task's requests, newest first. People who left
// the workspace come back as null.
func loadRequests(ctx context.Context, tx pgx.Tx, taskID string) ([]mdl.ChangeRequest, error) {
	rows, err := tx.Query(ctx, `
		SELECT r.id, r.kind, r.status, r.payload, r.summary, r.note, r.review_note, r.created_at, r.decided_at,
		       CASE WHEN mq.user_id IS NULL THEN NULL ELSE json_build_object('id', rq.id, 'name', rq.name, 'image', rq.image_url) END,
		       CASE WHEN mv.user_id IS NULL THEN NULL ELSE json_build_object('id', rv.id, 'name', rv.name, 'image', rv.image_url) END
		  FROM change_requests r
		  LEFT JOIN users rq ON rq.id = r.requester_id
		  LEFT JOIN memberships mq ON mq.user_id = r.requester_id AND mq.workspace_id = r.workspace_id
		  LEFT JOIN users rv ON rv.id = r.reviewer_id
		  LEFT JOIN memberships mv ON mv.user_id = r.reviewer_id AND mv.workspace_id = r.workspace_id
		 WHERE r.task_id = $1
		 ORDER BY r.created_at DESC, r.id DESC
		 LIMIT 100`, taskID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (mdl.ChangeRequest, error) {
		var r mdl.ChangeRequest
		var requester, reviewer []byte
		var decidedAt *time.Time
		if err := row.Scan(&r.ID, &r.Kind, &r.Status, &r.Payload, &r.Summary, &r.Note, &r.ReviewNote,
			&r.CreatedAt, &decidedAt, &requester, &reviewer); err != nil {
			return r, err
		}
		r.DecidedAt = decidedAt
		for _, x := range []struct {
			raw []byte
			dst **mdl.Person
		}{{requester, &r.Requester}, {reviewer, &r.Reviewer}} {
			if x.raw != nil {
				*x.dst = &mdl.Person{}
				if err := json.Unmarshal(x.raw, *x.dst); err != nil {
					return r, err
				}
			}
		}
		return r, nil
	})
}
