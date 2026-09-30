package tasksvc

import (
	"context"
	"errors"
	"slices"

	"github.com/jackc/pgx/v5"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
	"github.com/intellicars/list-app/apps/api/internal/apperr"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/task/taskmdl"
	"github.com/intellicars/list-app/apps/api/internal/outbox"
)

// ApproveRequest applies a pending request as the reviewer, in one
// transaction with the decision. A request whose precondition no longer
// holds (field changed, item gone, already assigned…) is ErrRequestStale.
func (s *TaskSvc) ApproveRequest(ctx context.Context, tn Caller, id string) (mdl.Task, mdl.Viewer, error) {
	var keys []string
	task, v, err := s.review(ctx, tn, id, func(tx pgx.Tx, r requestRow, cur mdl.Task) error {
		if err := Authorize(accessOf(cur, tn), tn.UserID, ActionReview); err != nil {
			return err
		}
		key, err := s.apply(ctx, tx, tn, r, cur)
		if err != nil {
			return err
		}
		if key != "" {
			keys = append(keys, key)
		}
		return decide(ctx, tx, tn, r, "APPROVED", nil)
	})
	if err == nil {
		s.deleteBlobs(ctx, keys)
		s.log.Info("request_approved", "workspace_id", tn.WorkspaceID, "request_id", id, "user_id", tn.UserID)
	}
	return task, v, err
}

// RejectRequest declines a pending request with an optional note.
func (s *TaskSvc) RejectRequest(ctx context.Context, tn Caller, id string, req mdl.ReviewRequestReq) (mdl.Task, mdl.Viewer, error) {
	note, err := validNote(req.Note)
	if err != nil {
		return mdl.Task{}, mdl.Viewer{}, err
	}
	return s.review(ctx, tn, id, func(tx pgx.Tx, r requestRow, cur mdl.Task) error {
		if err := Authorize(accessOf(cur, tn), tn.UserID, ActionReview); err != nil {
			return err
		}
		return decide(ctx, tx, tn, r, "REJECTED", note)
	})
}

// CancelRequest withdraws the caller's own pending request.
func (s *TaskSvc) CancelRequest(ctx context.Context, tn Caller, id string) (mdl.Task, mdl.Viewer, error) {
	return s.review(ctx, tn, id, func(tx pgx.Tx, r requestRow, _ mdl.Task) error {
		if r.RequesterID == nil || *r.RequesterID != tn.UserID {
			return ErrNotRequester
		}
		return decide(ctx, tx, tn, r, "CANCELED", nil)
	})
}

// review locks a pending request and its task, runs fn and returns the
// updated task.
func (s *TaskSvc) review(ctx context.Context, tn Caller, id string, fn func(pgx.Tx, requestRow, mdl.Task) error) (mdl.Task, mdl.Viewer, error) {
	var task mdl.Task
	err := dbTenant(ctx, s, tn, func(tx pgx.Tx) error {
		r, err := lockRequest(ctx, tx, tn.WorkspaceID, id)
		if err != nil {
			return err
		}
		cur, err := load(ctx, tx, tn.WorkspaceID, r.TaskID, true)
		if err != nil {
			return err
		}
		if r.Status != "PENDING" {
			return errDecided(r.Status)
		}
		if err := fn(tx, r, cur); err != nil {
			return err
		}
		task, err = loadDetail(ctx, tx, tn.WorkspaceID, r.TaskID)
		return err
	})
	if err != nil {
		return mdl.Task{}, mdl.Viewer{}, wrap("request_review", err)
	}
	return task, Evaluate(accessOf(task, tn), tn.UserID), nil
}

func decide(ctx context.Context, tx pgx.Tx, tn Caller, r requestRow, status string, note *string) error {
	reviewer := &tn.UserID
	if status == "CANCELED" {
		reviewer = nil
	}
	if _, err := tx.Exec(ctx, `
		UPDATE change_requests SET status = $2, reviewer_id = $3, review_note = $4, decided_at = now() WHERE id = $1`,
		r.ID, status, reviewer, note); err != nil {
		return err
	}
	kind := map[string]string{"APPROVED": EvRequestApproved, "REJECTED": EvRequestRejected, "CANCELED": EvRequestCanceled}[status]
	if err := emit(ctx, tx, tn, r.TaskID, event{Kind: kind, Subject: r.Summary, To: deref(note)}); err != nil {
		return err
	}
	if status == "CANCELED" || r.RequesterID == nil {
		return nil
	}
	return outbox.Emit(ctx, tx, tn.WorkspaceID, outbox.KindRequestReviewed, outbox.RequestReviewed{
		TaskID: r.TaskID, ActorID: tn.UserID, RequestID: r.ID, RequesterID: *r.RequesterID,
		Approved: status == "APPROVED", Summary: r.Summary,
	})
}

// apply performs an approved request through the direct-edit functions and
// returns a blob key to delete after commit (ATTACHMENT_REMOVE).
func (s *TaskSvc) apply(ctx context.Context, tx pgx.Tx, tn Caller, r requestRow, cur mdl.Task) (string, error) {
	p := r.Payload
	ids := func(ps []mdl.Person) []string {
		out := make([]string, 0, len(ps))
		for _, x := range ps {
			out = append(out, x.ID)
		}
		return out
	}
	switch r.Kind {
	case "UPDATE":
		field, value := deref(p.Field), deref(p.Value)
		if fieldValue(fieldsOf(cur), field) != deref(p.From) {
			return "", ErrRequestStale
		}
		var req mdl.UpdateTaskReq
		switch field {
		case "status":
			req.Status = apiserver.Optional[string]{Set: true, Value: value}
		case "startDate":
			req.StartDate = apiserver.Optional[string]{Set: true, Value: value}
		case "endDate":
			req.EndDate = apiserver.Optional[string]{Set: true, Value: value}
		case "dueDate":
			var due *string
			if value != "" {
				due = &value
			}
			req.DueDate = apiserver.Optional[*string]{Set: true, Value: due}
		}
		return "", staleOnInvalid(updateTx(ctx, tx, tn, cur, req))
	case "ASSIGNEE_ADD", "ASSIGNEE_REMOVE":
		uid := deref(p.UserID)
		current := ids(cur.Assignees)
		if slices.Contains(current, uid) == (r.Kind == "ASSIGNEE_ADD") {
			return "", ErrRequestStale
		}
		next := slices.DeleteFunc(slices.Clone(current), func(x string) bool { return x == uid })
		if r.Kind == "ASSIGNEE_ADD" {
			next = append(next, uid)
		}
		return "", staleOnInvalid(replaceSetTx(ctx, tx, tn, cur, SetAssignees, next))
	case "SUBTASK_ADD":
		var assignees []string
		if r.RequesterID != nil {
			if _, err := memberName(ctx, tx, tn.WorkspaceID, *r.RequesterID); err == nil {
				assignees = []string{*r.RequesterID}
			}
		}
		_, err := createTx(ctx, tx, tn, mdl.CreateTaskReq{
			Title: deref(p.Title), StartDate: cur.StartDate.Format(mdl.DateLayout), EndDate: cur.EndDate.Format(mdl.DateLayout),
			ParentID: &cur.ID, AssigneeIDs: assignees,
		})
		return "", staleOnInvalid(err)
	case "CHECKLIST_ADD":
		_, err := addChecklistItemTx(ctx, tx, tn, cur.ID, mdl.CreateChecklistItemReq{Title: deref(p.Title)})
		return "", err
	case "CHECKLIST_UPDATE", "CHECKLIST_REMOVE":
		itemID := deref(p.ItemID)
		if _, ok, err := checklistItemOf(ctx, tx, cur.ID, itemID); err != nil {
			return "", err
		} else if !ok {
			return "", ErrRequestStale
		}
		if r.Kind == "CHECKLIST_REMOVE" {
			return "", deleteChecklistItemTx(ctx, tx, tn, cur.ID, itemID)
		}
		var req mdl.UpdateChecklistItemReq
		if p.Title != nil {
			req.Title = apiserver.Optional[string]{Set: true, Value: *p.Title}
		}
		if p.Done != nil {
			req.Done = apiserver.Optional[bool]{Set: true, Value: *p.Done}
		}
		return "", updateChecklistItemTx(ctx, tx, tn, cur.ID, itemID, req)
	case "ATTACHMENT_REMOVE":
		row, err := s.loadAttachment(ctx, tx, tn.WorkspaceID, deref(p.AttachmentID))
		if errors.Is(err, ErrAttachmentNotFound) || (err == nil && row.TaskID != cur.ID) {
			return "", ErrRequestStale
		}
		if err != nil {
			return "", err
		}
		return row.StorageKey, deleteAttachmentTx(ctx, tx, tn, row)
	}
	return "", ErrRequestStale
}

// staleOnInvalid turns a validation failure while applying (the task moved
// on, e.g. the end date is now before the requested start) into a conflict.
func staleOnInvalid(err error) error {
	var v *apperr.Validation
	if errors.As(err, &v) {
		return ErrRequestStale
	}
	return err
}
