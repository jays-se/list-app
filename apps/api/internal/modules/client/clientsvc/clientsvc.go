// Package clientsvc manages clients (E8-S1). Deleting a client unlinks its
// tasks (tasks.client_id ON DELETE SET NULL), never deletes them.
package clientsvc

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/mail"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
	"github.com/intellicars/list-app/apps/api/internal/apperr"
	"github.com/intellicars/list-app/apps/api/internal/db"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/client/clientmdl"
	labelmdl "github.com/intellicars/list-app/apps/api/internal/modules/label/labelmdl"
	"github.com/intellicars/list-app/apps/api/internal/uuidx"
)

var (
	ErrNotFound = &apperr.NotFound{Detail: "Client not found."}
	ErrNotOwner = &apperr.Forbidden{Detail: "Only workspace owners can delete clients."}
)

type ClientSvc struct {
	pool *pgxpool.Pool
	log  *slog.Logger
}

func NewClientSvc(pool *pgxpool.Pool, log *slog.Logger) *ClientSvc {
	return &ClientSvc{pool: pool, log: log}
}

func trimOrNil(s *string) *string {
	if s == nil {
		return nil
	}
	t := strings.TrimSpace(*s)
	if t == "" {
		return nil
	}
	return &t
}

// Validate mirrors packages/domain clients validators.
func Validate(in mdl.ClientInput) (mdl.ClientInput, error) {
	var errs []apiserver.FieldError
	in.Name = strings.TrimSpace(in.Name)
	in.Email, in.Phone, in.Notes = trimOrNil(in.Email), trimOrNil(in.Phone), trimOrNil(in.Notes)
	switch n := utf8.RuneCountInString(in.Name); {
	case n == 0:
		errs = append(errs, apiserver.FieldError{Field: "name", Message: "Client name is required"})
	case n > 100:
		errs = append(errs, apiserver.FieldError{Field: "name", Message: "Client name must be 100 characters or fewer"})
	}
	if in.Email != nil {
		if a, err := mail.ParseAddress(*in.Email); err != nil || a.Address != *in.Email {
			errs = append(errs, apiserver.FieldError{Field: "email", Message: "Enter a valid email"})
		}
	}
	if in.Phone != nil && utf8.RuneCountInString(*in.Phone) > 40 {
		errs = append(errs, apiserver.FieldError{Field: "phone", Message: "Phone must be 40 characters or fewer"})
	}
	if !slices.Contains(labelmdl.Colors, in.Color) {
		errs = append(errs, apiserver.FieldError{Field: "color", Message: "Pick a color"})
	}
	if len(errs) > 0 {
		return in, &apperr.Validation{Fields: errs}
	}
	return in, nil
}

const clientSelect = `
SELECT c.id, c.name, c.email, c.phone, c.color, c.notes,
       (SELECT count(*) FROM tasks t WHERE t.client_id = c.id)
  FROM clients c`

func scan(r pgx.Row) (mdl.Client, error) {
	var c mdl.Client
	err := r.Scan(&c.ID, &c.Name, &c.Email, &c.Phone, &c.Color, &c.Notes, &c.TaskCount)
	return c, err
}

func (s *ClientSvc) List(ctx context.Context, t db.Tenant) ([]mdl.Client, error) {
	var out []mdl.Client
	err := db.WithTenant(ctx, s.pool, t, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, clientSelect+` WHERE c.workspace_id = $1 ORDER BY lower(c.name), c.id`, t.WorkspaceID)
		if err != nil {
			return err
		}
		out, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (mdl.Client, error) { return scan(r) })
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("clientsvc: list: %w", err)
	}
	return out, nil
}

func (s *ClientSvc) get(ctx context.Context, tx pgx.Tx, workspaceID, id string) (mdl.Client, error) {
	if !uuidx.Valid(id) {
		return mdl.Client{}, ErrNotFound
	}
	c, err := scan(tx.QueryRow(ctx, clientSelect+` WHERE c.id = $1 AND c.workspace_id = $2`, id, workspaceID))
	if errors.Is(err, pgx.ErrNoRows) {
		return mdl.Client{}, ErrNotFound
	}
	return c, err
}

func (s *ClientSvc) Get(ctx context.Context, t db.Tenant, id string) (mdl.Client, error) {
	var c mdl.Client
	err := db.WithTenant(ctx, s.pool, t, func(tx pgx.Tx) error {
		var err error
		c, err = s.get(ctx, tx, t.WorkspaceID, id)
		return err
	})
	return c, err
}

func (s *ClientSvc) Create(ctx context.Context, t db.Tenant, in mdl.ClientInput) (mdl.Client, error) {
	in, err := Validate(in)
	if err != nil {
		return mdl.Client{}, err
	}
	var c mdl.Client
	err = db.WithTenant(ctx, s.pool, t, func(tx pgx.Tx) error {
		var id string
		if err := tx.QueryRow(ctx, `
			INSERT INTO clients (workspace_id, name, email, phone, color, notes, created_by)
			VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
			t.WorkspaceID, in.Name, in.Email, in.Phone, in.Color, in.Notes, t.UserID).Scan(&id); err != nil {
			return err
		}
		c, err = s.get(ctx, tx, t.WorkspaceID, id)
		return err
	})
	if err != nil {
		return mdl.Client{}, fmt.Errorf("clientsvc: create: %w", err)
	}
	s.log.Info("client_created", "workspace_id", t.WorkspaceID, "client_id", c.ID)
	return c, nil
}

func (s *ClientSvc) Update(ctx context.Context, t db.Tenant, id string, in mdl.ClientInput) (mdl.Client, error) {
	in, err := Validate(in)
	if err != nil {
		return mdl.Client{}, err
	}
	var c mdl.Client
	err = db.WithTenant(ctx, s.pool, t, func(tx pgx.Tx) error {
		if _, err := s.get(ctx, tx, t.WorkspaceID, id); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE clients SET name = $3, email = $4, phone = $5, color = $6, notes = $7, updated_at = now()
			 WHERE id = $1 AND workspace_id = $2`, id, t.WorkspaceID, in.Name, in.Email, in.Phone, in.Color, in.Notes); err != nil {
			return err
		}
		c, err = s.get(ctx, tx, t.WorkspaceID, id)
		return err
	})
	if errors.Is(err, ErrNotFound) {
		return mdl.Client{}, ErrNotFound
	}
	if err != nil {
		return mdl.Client{}, fmt.Errorf("clientsvc: update: %w", err)
	}
	return c, nil
}

func (s *ClientSvc) Delete(ctx context.Context, t db.Tenant, role, id string) error {
	if role != "OWNER" {
		return ErrNotOwner
	}
	var n int64
	err := db.WithTenant(ctx, s.pool, t, func(tx pgx.Tx) error {
		if !uuidx.Valid(id) {
			return ErrNotFound
		}
		tag, err := tx.Exec(ctx, `DELETE FROM clients WHERE id = $1 AND workspace_id = $2`, id, t.WorkspaceID)
		n = tag.RowsAffected()
		return err
	})
	if errors.Is(err, ErrNotFound) || (err == nil && n == 0) {
		return ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("clientsvc: delete: %w", err)
	}
	s.log.Info("client_deleted", "workspace_id", t.WorkspaceID, "client_id", id)
	return nil
}
