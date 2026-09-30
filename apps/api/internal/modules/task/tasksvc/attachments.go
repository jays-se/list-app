package tasksvc

import (
	"context"
	"errors"
	"fmt"
	"path"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"

	"github.com/intellicars/list-app/apps/api/internal/apperr"
	"github.com/intellicars/list-app/apps/api/internal/blobstore"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/task/taskmdl"
	"github.com/intellicars/list-app/apps/api/internal/uuidx"
)

// Limits from the reference app (E4-S9).
const (
	MaxAttachmentBytes = 5 * 1024 * 1024
	MaxAttachments     = 5
	pendingWindow      = 15 * time.Minute
)

var (
	ErrAttachmentNotFound = &apperr.NotFound{Detail: "This attachment no longer exists."}
	ErrUploadIncomplete   = &apperr.Conflict{Type: "upload_incomplete", Detail: "The upload hasn't finished. Try again."}
)

type attachmentRow struct {
	mdl.Attachment
	TaskID, StorageKey, Status string
}

func (s *TaskSvc) loadAttachment(ctx context.Context, tx pgx.Tx, workspaceID, id string) (attachmentRow, error) {
	if !uuidx.Valid(id) {
		return attachmentRow{}, ErrAttachmentNotFound
	}
	var a attachmentRow
	err := tx.QueryRow(ctx, `
		SELECT id, task_id, filename, mime_type, size, storage_key, status, created_at
		  FROM attachments WHERE id = $1 AND workspace_id = $2`, id, workspaceID).
		Scan(&a.ID, &a.TaskID, &a.Filename, &a.MimeType, &a.Size, &a.StorageKey, &a.Status, &a.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return attachmentRow{}, ErrAttachmentNotFound
	}
	a.DownloadURL = "/api/v1/attachments/" + a.ID
	return a, err
}

// cleanFilename drops any client path and control characters.
func cleanFilename(name string) string {
	name = path.Base(strings.ReplaceAll(strings.TrimSpace(name), `\`, "/"))
	name = strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, name)
	if name == "." || name == "/" {
		return ""
	}
	return name
}

// StartUpload reserves a slot and returns where to PUT the bytes (ADR-0022).
func (s *TaskSvc) StartUpload(ctx context.Context, tn Caller, taskID string, req mdl.CreateAttachmentReq) (mdl.Attachment, blobstore.Target, error) {
	name := cleanFilename(req.Filename)
	switch {
	case name == "" || utf8.RuneCountInString(name) > 255:
		return mdl.Attachment{}, blobstore.Target{}, apperr.Field("filename", "Choose a file with a name of 255 characters or fewer")
	case req.Size <= 0:
		return mdl.Attachment{}, blobstore.Target{}, apperr.Field("size", name+" is empty")
	case req.Size > MaxAttachmentBytes:
		return mdl.Attachment{}, blobstore.Target{}, apperr.Field("size", name+" is larger than 5MB")
	}
	mimeType := strings.TrimSpace(req.MimeType)
	if mimeType == "" || len(mimeType) > 127 || strings.ContainsAny(mimeType, "\r\n") {
		mimeType = "application/octet-stream"
	}
	var att mdl.Attachment
	var target blobstore.Target
	err := dbTenant(ctx, s, tn, func(tx pgx.Tx) error {
		task, err := load(ctx, tx, tn.WorkspaceID, taskID, true)
		if err != nil {
			return err
		}
		if err := Authorize(accessOf(task, tn), tn.UserID, ActionUpdate); err != nil {
			return err
		}
		var active int
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM attachments
			 WHERE task_id = $1 AND (status = 'READY' OR created_at > now() - $2::interval)`,
			taskID, fmt.Sprintf("%d seconds", int(pendingWindow.Seconds()))).Scan(&active); err != nil {
			return err
		}
		if active >= MaxAttachments {
			return apperr.Field("size", fmt.Sprintf("A task can have up to %d attachments", MaxAttachments))
		}
		var id string
		if err := tx.QueryRow(ctx, `SELECT gen_random_uuid()`).Scan(&id); err != nil {
			return err
		}
		key := "ws/" + tn.WorkspaceID + "/tasks/" + taskID + "/" + id
		if _, err := tx.Exec(ctx, `
			INSERT INTO attachments (id, workspace_id, task_id, filename, mime_type, size, storage_key, uploaded_by)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, id, tn.WorkspaceID, taskID, name, mimeType, req.Size, key, tn.UserID); err != nil {
			return err
		}
		target, err = s.blobs.PresignPut(ctx, key, mimeType, req.Size, 10*time.Minute)
		if err != nil {
			return err
		}
		row, err := s.loadAttachment(ctx, tx, tn.WorkspaceID, id)
		att = row.Attachment
		return err
	})
	if err != nil {
		return mdl.Attachment{}, blobstore.Target{}, wrap("attachment_start", err)
	}
	return att, target, nil
}

// CompleteUpload verifies the stored object's size, then marks it READY.
func (s *TaskSvc) CompleteUpload(ctx context.Context, tn Caller, id string) (mdl.Attachment, error) {
	var att mdl.Attachment
	var discard string
	err := dbTenant(ctx, s, tn, func(tx pgx.Tx) error {
		row, err := s.loadAttachment(ctx, tx, tn.WorkspaceID, id)
		if err != nil {
			return err
		}
		task, err := load(ctx, tx, tn.WorkspaceID, row.TaskID, true)
		if err != nil {
			return err
		}
		if err := Authorize(accessOf(task, tn), tn.UserID, ActionUpdate); err != nil {
			return err
		}
		if row.Status == "READY" {
			att = row.Attachment
			return nil
		}
		obj, err := s.blobs.Stat(ctx, row.StorageKey)
		if errors.Is(err, blobstore.ErrNotFound) {
			return ErrUploadIncomplete
		}
		if err != nil {
			return err
		}
		if obj.Size != row.Size || obj.Size > MaxAttachmentBytes {
			discard = row.StorageKey
			if _, err := tx.Exec(ctx, `DELETE FROM attachments WHERE id = $1`, id); err != nil {
				return err
			}
			return apperr.Field("size", row.Filename+" doesn't match its declared size (max 5MB)")
		}
		if _, err := tx.Exec(ctx, `UPDATE attachments SET status = 'READY' WHERE id = $1`, id); err != nil {
			return err
		}
		if err := emit(ctx, tx, tn, row.TaskID, event{Kind: EvAttachmentAdded, Subject: row.Filename}); err != nil {
			return err
		}
		row.Status = "READY"
		att = row.Attachment
		return nil
	})
	if discard != "" {
		s.deleteBlobs(ctx, []string{discard})
	}
	return att, wrap("attachment_complete", err)
}

// DownloadURL returns a short-lived signed URL for a READY attachment
// (any member of the workspace may download).
func (s *TaskSvc) DownloadURL(ctx context.Context, tn Caller, id string) (string, error) {
	var url string
	err := dbTenant(ctx, s, tn, func(tx pgx.Tx) error {
		row, err := s.loadAttachment(ctx, tx, tn.WorkspaceID, id)
		if err != nil {
			return err
		}
		if row.Status != "READY" {
			return ErrAttachmentNotFound
		}
		url, err = s.blobs.PresignGet(ctx, row.StorageKey, row.Filename, row.MimeType, 5*time.Minute)
		return err
	})
	return url, wrap("attachment_download", err)
}

// DeleteAttachment removes the row, then the stored bytes (best effort).
func (s *TaskSvc) DeleteAttachment(ctx context.Context, tn Caller, id string) error {
	var key string
	err := dbTenant(ctx, s, tn, func(tx pgx.Tx) error {
		row, err := s.loadAttachment(ctx, tx, tn.WorkspaceID, id)
		if err != nil {
			return err
		}
		task, err := load(ctx, tx, tn.WorkspaceID, row.TaskID, true)
		if err != nil {
			return err
		}
		if err := Authorize(accessOf(task, tn), tn.UserID, ActionUpdate); err != nil {
			return err
		}
		key = row.StorageKey
		return deleteAttachmentTx(ctx, tx, tn, row)
	})
	if err == nil && key != "" {
		s.deleteBlobs(ctx, []string{key})
	}
	return wrap("attachment_delete", err)
}

func deleteAttachmentTx(ctx context.Context, tx pgx.Tx, tn Caller, row attachmentRow) error {
	if _, err := tx.Exec(ctx, `DELETE FROM attachments WHERE id = $1`, row.ID); err != nil {
		return err
	}
	if row.Status == "READY" {
		return emit(ctx, tx, tn, row.TaskID, event{Kind: EvAttachmentRemoved, Subject: row.Filename})
	}
	return nil
}
