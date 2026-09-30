package tasksvc

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
	"github.com/intellicars/list-app/apps/api/internal/apperr"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/task/taskmdl"
)

const MaxBulk = 100

var (
	ErrMissingIdempotencyKey = apperr.Field("Idempotency-Key", "Send an Idempotency-Key header (8–200 characters)")
	ErrKeyReused             = apperr.Field("Idempotency-Key", "This Idempotency-Key was already used for a different request")
)

// BulkCreate creates every title in one transaction (all or nothing).
// PERSONAL tasks are assigned to the caller (ADR-0024). The response is
// stored under key so a retry returns it instead of creating duplicates.
func (s *TaskSvc) BulkCreate(ctx context.Context, tn Caller, key string, req mdl.BulkCreateReq, render func([]mdl.Task) any) (json.RawMessage, error) {
	key = strings.TrimSpace(key)
	if n := len(key); n < 8 || n > 200 {
		return nil, ErrMissingIdempotencyKey
	}
	if !slices.Contains(mdl.Sources, req.Source) {
		return nil, apperr.Field("source", "Choose meeting note or personal")
	}
	switch n := len(req.Titles); {
	case n == 0:
		return nil, apperr.Field("titles", "Add at least one line")
	case n > MaxBulk:
		return nil, apperr.Field("titles", fmt.Sprintf("Capture up to %d lines at a time", MaxBulk))
	}
	body, _ := json.Marshal(req)
	sum := sha256.Sum256(body)
	hash := hex.EncodeToString(sum[:])

	var out json.RawMessage
	err := dbTenant(ctx, s, tn, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			INSERT INTO idempotency_keys (workspace_id, user_id, key, request_hash) VALUES ($1, $2, $3, $4)
			ON CONFLICT (user_id, key) DO NOTHING`, tn.WorkspaceID, tn.UserID, key, hash)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			var storedHash string
			var resp *string
			if err := tx.QueryRow(ctx, `SELECT request_hash, response FROM idempotency_keys WHERE user_id = $1 AND key = $2`,
				tn.UserID, key).Scan(&storedHash, &resp); err != nil {
				return err
			}
			if storedHash != hash || resp == nil {
				return ErrKeyReused
			}
			out = json.RawMessage(*resp)
			return nil
		}
		var assignees []string
		if req.Source == "PERSONAL" {
			assignees = []string{tn.UserID}
		}
		source := req.Source
		ids := make([]string, 0, len(req.Titles))
		for i, title := range req.Titles {
			id, err := createTx(ctx, tx, tn, mdl.CreateTaskReq{
				Title: title, StartDate: req.StartDate, EndDate: req.EndDate,
				AssigneeIDs: assignees, Source: &source,
			})
			if err != nil {
				return indexFields(err, i)
			}
			ids = append(ids, id)
		}
		tasks := make([]mdl.Task, 0, len(ids))
		for _, id := range ids {
			t, err := load(ctx, tx, tn.WorkspaceID, id, false)
			if err != nil {
				return err
			}
			tasks = append(tasks, t)
		}
		out, err = json.Marshal(render(tasks))
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE idempotency_keys SET status_code = 201, response = $3 WHERE user_id = $1 AND key = $2`,
			tn.UserID, key, string(out))
		return err
	})
	if err != nil {
		return nil, wrap("bulk_create", err)
	}
	s.log.Info("tasks_bulk_created", "workspace_id", tn.WorkspaceID, "user_id", tn.UserID, "count", len(req.Titles), "source", req.Source)
	return out, nil
}

// indexFields prefixes validation fields with the failing line: title →
// titles[3]; date errors stay on their field.
func indexFields(err error, i int) error {
	var v *apperr.Validation
	if !errors.As(err, &v) {
		return err
	}
	out := &apperr.Validation{}
	for _, f := range v.Fields {
		if f.Field == "title" {
			f = apiserver.FieldError{Field: fmt.Sprintf("titles[%d]", i), Message: fmt.Sprintf("Line %d: %s", i+1, f.Message)}
		}
		out.Fields = append(out.Fields, f)
	}
	return out
}
