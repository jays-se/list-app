// Package labelsvc manages workspace labels (E8-S2).
package labelsvc

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/intellicars/list-app/apps/api/internal/apperr"
	"github.com/intellicars/list-app/apps/api/internal/db"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/label/labelmdl"
	"github.com/intellicars/list-app/apps/api/internal/uuidx"
)

var (
	ErrNotFound  = &apperr.NotFound{Detail: "Label not found."}
	ErrNotOwner  = &apperr.Forbidden{Detail: "Only workspace owners can delete labels."}
	ErrDuplicate = &apperr.Conflict{Type: "duplicate", Detail: "A label with this name already exists."}
)

type LabelSvc struct {
	pool *pgxpool.Pool
	log  *slog.Logger
}

func NewLabelSvc(pool *pgxpool.Pool, log *slog.Logger) *LabelSvc {
	return &LabelSvc{pool: pool, log: log}
}

// Validate mirrors the web validator (packages/domain labels.validators.ts).
func Validate(name, color string) (string, error) {
	name = strings.TrimSpace(name)
	v := &apperr.Validation{}
	switch n := utf8.RuneCountInString(name); {
	case n == 0:
		v.Fields = append(v.Fields, apperr.Field("name", "Label name is required").Fields...)
	case n > 40:
		v.Fields = append(v.Fields, apperr.Field("name", "Label name must be 40 characters or fewer").Fields...)
	}
	if !slices.Contains(mdl.Colors, color) {
		v.Fields = append(v.Fields, apperr.Field("color", "Pick a label color").Fields...)
	}
	if len(v.Fields) > 0 {
		return "", v
	}
	return name, nil
}

func (s *LabelSvc) List(ctx context.Context, t db.Tenant) ([]mdl.Label, error) {
	var labels []mdl.Label
	err := db.WithTenant(ctx, s.pool, t, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `SELECT id, name, color FROM labels WHERE workspace_id = $1 ORDER BY lower(name), id`, t.WorkspaceID)
		if err != nil {
			return err
		}
		labels, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (mdl.Label, error) {
			var l mdl.Label
			return l, r.Scan(&l.ID, &l.Name, &l.Color)
		})
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("labelsvc: list: %w", err)
	}
	return labels, nil
}

func (s *LabelSvc) Create(ctx context.Context, t db.Tenant, rawName, color string) (mdl.Label, error) {
	name, err := Validate(rawName, color)
	if err != nil {
		return mdl.Label{}, err
	}
	l := mdl.Label{Name: name, Color: color}
	err = db.WithTenant(ctx, s.pool, t, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`INSERT INTO labels (workspace_id, name, color, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
			t.WorkspaceID, name, color, t.UserID).Scan(&l.ID)
	})
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23505" {
		return mdl.Label{}, ErrDuplicate
	}
	if err != nil {
		return mdl.Label{}, fmt.Errorf("labelsvc: create: %w", err)
	}
	s.log.Info("label_created", "workspace_id", t.WorkspaceID, "label_id", l.ID)
	return l, nil
}

// Delete removes a label from the workspace and every task (owners only).
func (s *LabelSvc) Delete(ctx context.Context, t db.Tenant, role, labelID string) error {
	if role != "OWNER" {
		return ErrNotOwner
	}
	if !uuidx.Valid(labelID) {
		return ErrNotFound
	}
	var deleted int64
	err := db.WithTenant(ctx, s.pool, t, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `DELETE FROM labels WHERE id = $1 AND workspace_id = $2`, labelID, t.WorkspaceID)
		deleted = tag.RowsAffected()
		return err
	})
	if err != nil {
		return fmt.Errorf("labelsvc: delete: %w", err)
	}
	if deleted == 0 {
		return ErrNotFound
	}
	s.log.Info("label_deleted", "workspace_id", t.WorkspaceID, "label_id", labelID)
	return nil
}
