// Package docsvc implements markdown docs and their files (E11-S1,
// ADR-0025): any member reads and edits; the creator or a workspace OWNER
// deletes. Edits use optimistic concurrency like tasks (If-Match).
package docsvc

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/intellicars/list-app/apps/api/internal/apperr"
	"github.com/intellicars/list-app/apps/api/internal/blobstore"
	"github.com/intellicars/list-app/apps/api/internal/db"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/doc/docmdl"
	taskmdl "github.com/intellicars/list-app/apps/api/internal/modules/task/taskmdl"
	"github.com/intellicars/list-app/apps/api/internal/uuidx"
)

const (
	MaxTitle   = 200
	MaxContent = 200_000
)

var (
	ErrNotFound       = &apperr.NotFound{Detail: "This doc no longer exists."}
	ErrStale          = &apperr.Conflict{Type: "conflict", Detail: "Someone else changed this doc. Reload to see the latest version."}
	ErrMissingIfMatch = &apperr.Precondition{Detail: "Send If-Match with the doc version you edited."}
	ErrCantDelete     = &apperr.Forbidden{Detail: "Only the doc's creator or a workspace owner can delete it."}
)

// Caller is who acts: tenant (RLS) plus workspace role.
type Caller struct {
	db.Tenant
	Role string
}

type DocSvc struct {
	pool  *pgxpool.Pool
	blobs blobstore.Store
	log   *slog.Logger
}

func NewDocSvc(pool *pgxpool.Pool, blobs blobstore.Store, log *slog.Logger) *DocSvc {
	return &DocSvc{pool: pool, blobs: blobs, log: log}
}

func (s *DocSvc) tx(ctx context.Context, c Caller, fn func(pgx.Tx) error) error {
	return db.WithTenant(ctx, s.pool, c.Tenant, fn)
}

const docSelect = `
SELECT d.id, d.title, d.content, d.created_at, d.updated_at, d.version,
       CASE WHEN cl.id IS NULL THEN NULL ELSE json_build_object('id', cl.id, 'name', cl.name, 'color', cl.color) END,
       CASE WHEN cu.id IS NULL OR cm.user_id IS NULL THEN NULL ELSE json_build_object('id', cu.id, 'name', cu.name, 'image', cu.image_url) END,
       CASE WHEN uu.id IS NULL OR um.user_id IS NULL THEN NULL ELSE json_build_object('id', uu.id, 'name', uu.name, 'image', uu.image_url) END,
       (SELECT count(*) FROM doc_files f WHERE f.doc_id = d.id AND f.status = 'READY'),
       d.created_by::text
  FROM docs d
  LEFT JOIN clients cl ON cl.id = d.client_id
  LEFT JOIN users cu ON cu.id = d.created_by
  LEFT JOIN memberships cm ON cm.user_id = d.created_by AND cm.workspace_id = d.workspace_id
  LEFT JOIN users uu ON uu.id = d.updated_by
  LEFT JOIN memberships um ON um.user_id = d.updated_by AND um.workspace_id = d.workspace_id`

type row struct {
	mdl.Doc
	creatorID *string
}

func scan(r pgx.Row) (row, error) {
	var d row
	var client, created, updated []byte
	if err := r.Scan(&d.ID, &d.Title, &d.Content, &d.CreatedAt, &d.UpdatedAt, &d.Version, &client, &created, &updated, &d.FileCount, &d.creatorID); err != nil {
		return d, err
	}
	for _, x := range []struct {
		raw []byte
		dst any
	}{{client, &d.Client}, {created, &d.CreatedBy}, {updated, &d.UpdatedBy}} {
		if x.raw != nil {
			if err := json.Unmarshal(x.raw, x.dst); err != nil {
				return d, err
			}
		}
	}
	return d, nil
}

func viewer(d row, c Caller) mdl.DocViewer {
	return mdl.DocViewer{CanDelete: c.Role == "OWNER" || (d.creatorID != nil && *d.creatorID == c.UserID)}
}

// List returns docs, most recently edited first (optionally for one client).
func (s *DocSvc) List(ctx context.Context, c Caller, clientID string) ([]mdl.Doc, error) {
	if clientID != "" && !uuidx.Valid(clientID) {
		return []mdl.Doc{}, nil
	}
	var out []mdl.Doc
	err := s.tx(ctx, c, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, docSelect+`
			WHERE d.workspace_id = $1 AND ($2 = '' OR d.client_id::text = $2)
			ORDER BY d.updated_at DESC, d.id LIMIT 1000`, c.WorkspaceID, clientID)
		if err != nil {
			return err
		}
		rs, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (row, error) { return scan(r) })
		for _, r := range rs {
			out = append(out, r.Doc)
		}
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("docsvc: list: %w", err)
	}
	if out == nil {
		out = []mdl.Doc{}
	}
	return out, nil
}

func load(ctx context.Context, tx pgx.Tx, workspaceID, id string, lock bool) (row, error) {
	if !uuidx.Valid(id) {
		return row{}, ErrNotFound
	}
	q := docSelect + ` WHERE d.id = $1 AND d.workspace_id = $2`
	if lock {
		if _, err := tx.Exec(ctx, `SELECT 1 FROM docs WHERE id = $1 FOR UPDATE`, id); err != nil {
			return row{}, err
		}
	}
	d, err := scan(tx.QueryRow(ctx, q, id, workspaceID))
	if errors.Is(err, pgx.ErrNoRows) {
		return row{}, ErrNotFound
	}
	if err != nil {
		return row{}, err
	}
	files, err := tx.Query(ctx, `
		SELECT f.id, f.filename, f.mime_type, f.size, f.created_at,
		       CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name, 'image', u.image_url) END
		  FROM doc_files f LEFT JOIN users u ON u.id = f.uploaded_by
		 WHERE f.doc_id = $1 AND f.status = 'READY' ORDER BY f.created_at, f.id`, id)
	if err != nil {
		return row{}, err
	}
	d.Files, err = pgx.CollectRows(files, func(r pgx.CollectableRow) (taskmdl.Attachment, error) {
		var a taskmdl.Attachment
		var by []byte
		if err := r.Scan(&a.ID, &a.Filename, &a.MimeType, &a.Size, &a.CreatedAt, &by); err != nil {
			return a, err
		}
		a.DownloadURL = "/api/v1/doc-files/" + a.ID
		if by != nil {
			a.UploadedBy = &taskmdl.Person{}
			if err := json.Unmarshal(by, a.UploadedBy); err != nil {
				return a, err
			}
		}
		return a, nil
	})
	return d, err
}

// Get returns one doc with its files.
func (s *DocSvc) Get(ctx context.Context, c Caller, id string) (mdl.Doc, mdl.DocViewer, error) {
	var d row
	err := s.tx(ctx, c, func(tx pgx.Tx) error {
		var err error
		d, err = load(ctx, tx, c.WorkspaceID, id, false)
		return err
	})
	if err != nil {
		return mdl.Doc{}, mdl.DocViewer{}, wrap("get", err)
	}
	return d.Doc, viewer(d, c), nil
}

func validTitle(t string) (string, error) {
	t = strings.TrimSpace(t)
	switch n := utf8.RuneCountInString(t); {
	case n == 0:
		return "", apperr.Field("title", "Give the doc a title")
	case n > MaxTitle:
		return "", apperr.Field("title", fmt.Sprintf("Titles must be %d characters or fewer", MaxTitle))
	}
	return t, nil
}

func validContent(c string) error {
	if utf8.RuneCountInString(c) > MaxContent {
		return apperr.Field("content", "Docs must be 200,000 characters or fewer")
	}
	return nil
}

func checkClient(ctx context.Context, tx pgx.Tx, workspaceID string, id *string) (*string, error) {
	if id == nil || *id == "" {
		return nil, nil
	}
	var ok bool
	if uuidx.Valid(*id) {
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM clients WHERE id = $1 AND workspace_id = $2)`, *id, workspaceID).Scan(&ok); err != nil {
			return nil, err
		}
	}
	if !ok {
		return nil, apperr.Field("clientId", "Choose a client from this workspace")
	}
	return id, nil
}

// Create adds a doc.
func (s *DocSvc) Create(ctx context.Context, c Caller, req mdl.CreateDocReq) (mdl.Doc, mdl.DocViewer, error) {
	title, err := validTitle(req.Title)
	if err != nil {
		return mdl.Doc{}, mdl.DocViewer{}, err
	}
	if err := validContent(req.Content); err != nil {
		return mdl.Doc{}, mdl.DocViewer{}, err
	}
	var d row
	err = s.tx(ctx, c, func(tx pgx.Tx) error {
		clientID, err := checkClient(ctx, tx, c.WorkspaceID, req.ClientID)
		if err != nil {
			return err
		}
		var id string
		if err := tx.QueryRow(ctx, `
			INSERT INTO docs (workspace_id, title, content, client_id, created_by, updated_by)
			VALUES ($1, $2, $3, $4, $5, $5) RETURNING id`, c.WorkspaceID, title, req.Content, clientID, c.UserID).Scan(&id); err != nil {
			return err
		}
		d, err = load(ctx, tx, c.WorkspaceID, id, false)
		return err
	})
	if err != nil {
		return mdl.Doc{}, mdl.DocViewer{}, wrap("create", err)
	}
	s.log.Info("doc_created", "workspace_id", c.WorkspaceID, "doc_id", d.ID, "user_id", c.UserID)
	return d.Doc, viewer(d, c), nil
}

// Update applies present fields when ifMatch is the current version.
func (s *DocSvc) Update(ctx context.Context, c Caller, id, ifMatch string, req mdl.UpdateDocReq) (mdl.Doc, mdl.DocViewer, error) {
	expected, err := parseETag(ifMatch)
	if err != nil {
		return mdl.Doc{}, mdl.DocViewer{}, err
	}
	var d row
	err = s.tx(ctx, c, func(tx pgx.Tx) error {
		cur, err := load(ctx, tx, c.WorkspaceID, id, true)
		if err != nil {
			return err
		}
		if cur.Version != expected {
			return ErrStale
		}
		title, content := cur.Title, cur.Content
		if req.Title.Set {
			if title, err = validTitle(req.Title.Value); err != nil {
				return err
			}
		}
		if req.Content.Set {
			if err := validContent(req.Content.Value); err != nil {
				return err
			}
			content = req.Content.Value
		}
		var clientID *string
		if cur.Client != nil {
			clientID = &cur.Client.ID
		}
		if req.ClientID.Set {
			if clientID, err = checkClient(ctx, tx, c.WorkspaceID, req.ClientID.Value); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(ctx, `
			UPDATE docs SET title = $2, content = $3, client_id = $4, updated_by = $5, updated_at = now(), version = version + 1
			 WHERE id = $1`, id, title, content, clientID, c.UserID); err != nil {
			return err
		}
		d, err = load(ctx, tx, c.WorkspaceID, id, false)
		return err
	})
	if err != nil {
		return mdl.Doc{}, mdl.DocViewer{}, wrap("update", err)
	}
	return d.Doc, viewer(d, c), nil
}

// Delete removes a doc and its files (creator or workspace OWNER).
func (s *DocSvc) Delete(ctx context.Context, c Caller, id string) error {
	var keys []string
	err := s.tx(ctx, c, func(tx pgx.Tx) error {
		d, err := load(ctx, tx, c.WorkspaceID, id, true)
		if err != nil {
			return err
		}
		if !viewer(d, c).CanDelete {
			return ErrCantDelete
		}
		rows, err := tx.Query(ctx, `SELECT storage_key FROM doc_files WHERE doc_id = $1`, id)
		if err != nil {
			return err
		}
		if keys, err = pgx.CollectRows(rows, pgx.RowTo[string]); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `DELETE FROM docs WHERE id = $1`, id)
		return err
	})
	if err != nil {
		return wrap("delete", err)
	}
	s.deleteBlobs(ctx, keys)
	s.log.Info("doc_deleted", "workspace_id", c.WorkspaceID, "doc_id", id, "user_id", c.UserID)
	return nil
}

func (s *DocSvc) deleteBlobs(ctx context.Context, keys []string) {
	for _, k := range keys {
		if err := s.blobs.Delete(ctx, k); err != nil {
			s.log.Warn("blob_delete_failed", "key", k, "error", err)
		}
	}
}

// ETag formats a version as a strong ETag.
func ETag(version int) string { return `"` + strconv.Itoa(version) + `"` }

func parseETag(v string) (int, error) {
	v = strings.Trim(strings.TrimPrefix(strings.TrimSpace(v), "W/"), `"`)
	n, err := strconv.Atoi(v)
	if v == "" || err != nil {
		return 0, ErrMissingIfMatch
	}
	return n, nil
}

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
	return fmt.Errorf("docsvc: %s: %w", op, err)
}
