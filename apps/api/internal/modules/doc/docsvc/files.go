package docsvc

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"

	"github.com/intellicars/list-app/apps/api/internal/apperr"
	"github.com/intellicars/list-app/apps/api/internal/blobstore"
	taskmdl "github.com/intellicars/list-app/apps/api/internal/modules/task/taskmdl"
	"github.com/intellicars/list-app/apps/api/internal/uuidx"
)

// Doc upload limits (reference app: docs accept files up to 20 MB).
const (
	MaxFileBytes  = 20 * 1024 * 1024
	MaxFiles      = 10
	pendingWindow = 15 * time.Minute
)

var (
	ErrFileNotFound     = &apperr.NotFound{Detail: "This file no longer exists."}
	ErrUploadIncomplete = &apperr.Conflict{Type: "upload_incomplete", Detail: "The upload hasn't finished. Try again."}
)

type fileRow struct {
	taskmdl.Attachment
	DocID, StorageKey, Status string
}

func loadFile(ctx context.Context, tx pgx.Tx, workspaceID, id string) (fileRow, error) {
	if !uuidx.Valid(id) {
		return fileRow{}, ErrFileNotFound
	}
	var f fileRow
	err := tx.QueryRow(ctx, `
		SELECT id, doc_id, filename, mime_type, size, storage_key, status, created_at
		  FROM doc_files WHERE id = $1 AND workspace_id = $2`, id, workspaceID).
		Scan(&f.ID, &f.DocID, &f.Filename, &f.MimeType, &f.Size, &f.StorageKey, &f.Status, &f.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return fileRow{}, ErrFileNotFound
	}
	f.DownloadURL = "/api/v1/doc-files/" + f.ID
	return f, err
}

// StartUpload reserves a file slot on a doc and returns where to PUT it.
func (s *DocSvc) StartUpload(ctx context.Context, c Caller, docID string, req taskmdl.CreateAttachmentReq) (taskmdl.Attachment, blobstore.Target, error) {
	name := blobstore.CleanFilename(req.Filename)
	switch {
	case name == "" || utf8.RuneCountInString(name) > 255:
		return taskmdl.Attachment{}, blobstore.Target{}, apperr.Field("filename", "Choose a file with a name of 255 characters or fewer")
	case req.Size <= 0:
		return taskmdl.Attachment{}, blobstore.Target{}, apperr.Field("size", name+" is empty")
	case req.Size > MaxFileBytes:
		return taskmdl.Attachment{}, blobstore.Target{}, apperr.Field("size", name+" is larger than 20MB")
	}
	mimeType := strings.TrimSpace(req.MimeType)
	if mimeType == "" || len(mimeType) > 127 || strings.ContainsAny(mimeType, "\r\n") {
		mimeType = "application/octet-stream"
	}
	var att taskmdl.Attachment
	var target blobstore.Target
	err := s.tx(ctx, c, func(tx pgx.Tx) error {
		if _, err := load(ctx, tx, c.WorkspaceID, docID, true); err != nil {
			return err
		}
		var active int
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM doc_files WHERE doc_id = $1 AND (status = 'READY' OR created_at > now() - $2::interval)`,
			docID, fmt.Sprintf("%d seconds", int(pendingWindow.Seconds()))).Scan(&active); err != nil {
			return err
		}
		if active >= MaxFiles {
			return apperr.Field("size", fmt.Sprintf("A doc can have up to %d files", MaxFiles))
		}
		var id string
		if err := tx.QueryRow(ctx, `SELECT gen_random_uuid()`).Scan(&id); err != nil {
			return err
		}
		key := "ws/" + c.WorkspaceID + "/docs/" + docID + "/" + id
		if _, err := tx.Exec(ctx, `
			INSERT INTO doc_files (id, workspace_id, doc_id, filename, mime_type, size, storage_key, uploaded_by)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, id, c.WorkspaceID, docID, name, mimeType, req.Size, key, c.UserID); err != nil {
			return err
		}
		var err error
		if target, err = s.blobs.PresignPut(ctx, key, mimeType, req.Size, 10*time.Minute); err != nil {
			return err
		}
		f, err := loadFile(ctx, tx, c.WorkspaceID, id)
		att = f.Attachment
		return err
	})
	if err != nil {
		return taskmdl.Attachment{}, blobstore.Target{}, wrap("file_start", err)
	}
	return att, target, nil
}

// CompleteUpload checks the stored size and marks the file READY.
func (s *DocSvc) CompleteUpload(ctx context.Context, c Caller, id string) (taskmdl.Attachment, error) {
	var att taskmdl.Attachment
	var discard string
	err := s.tx(ctx, c, func(tx pgx.Tx) error {
		f, err := loadFile(ctx, tx, c.WorkspaceID, id)
		if err != nil {
			return err
		}
		if f.Status == "READY" {
			att = f.Attachment
			return nil
		}
		obj, err := s.blobs.Stat(ctx, f.StorageKey)
		if errors.Is(err, blobstore.ErrNotFound) {
			return ErrUploadIncomplete
		}
		if err != nil {
			return err
		}
		if obj.Size != f.Size || obj.Size > MaxFileBytes {
			discard = f.StorageKey
			if _, err := tx.Exec(ctx, `DELETE FROM doc_files WHERE id = $1`, id); err != nil {
				return err
			}
			return apperr.Field("size", f.Filename+" doesn't match its declared size (max 20MB)")
		}
		if _, err := tx.Exec(ctx, `UPDATE doc_files SET status = 'READY' WHERE id = $1`, id); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE docs SET updated_at = now(), updated_by = $2 WHERE id = $1`, f.DocID, c.UserID); err != nil {
			return err
		}
		att = f.Attachment
		return nil
	})
	if discard != "" {
		s.deleteBlobs(ctx, []string{discard})
	}
	return att, wrap("file_complete", err)
}

// DownloadURL returns a short-lived signed URL for a READY file.
func (s *DocSvc) DownloadURL(ctx context.Context, c Caller, id string) (string, error) {
	var url string
	err := s.tx(ctx, c, func(tx pgx.Tx) error {
		f, err := loadFile(ctx, tx, c.WorkspaceID, id)
		if err != nil {
			return err
		}
		if f.Status != "READY" {
			return ErrFileNotFound
		}
		url, err = s.blobs.PresignGet(ctx, f.StorageKey, f.Filename, f.MimeType, 5*time.Minute)
		return err
	})
	return url, wrap("file_download", err)
}

// DeleteFile removes a file (any member, like editing the doc).
func (s *DocSvc) DeleteFile(ctx context.Context, c Caller, id string) error {
	var key string
	err := s.tx(ctx, c, func(tx pgx.Tx) error {
		f, err := loadFile(ctx, tx, c.WorkspaceID, id)
		if err != nil {
			return err
		}
		key = f.StorageKey
		_, err = tx.Exec(ctx, `DELETE FROM doc_files WHERE id = $1`, id)
		return err
	})
	if err == nil {
		s.deleteBlobs(ctx, []string{key})
	}
	return wrap("file_delete", err)
}
