// Package workspacesvc implements tenancy: create, join, switch, members,
// invite codes. Workspace-scoped statements run inside db.WithTenant (RLS);
// cross-workspace reads for one user run inside db.WithUser.
package workspacesvc

import (
	"context"
	"crypto/rand"
	"encoding/base32"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/intellicars/list-app/apps/api/internal/apperr"
	"github.com/intellicars/list-app/apps/api/internal/db"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/workspace/workspacemdl"
)

var (
	ErrInviteNotFound = &apperr.NotFound{Detail: "That invite code isn't valid."}
	ErrNotMember      = &apperr.NotFound{Detail: "Workspace not found."}
	ErrNotOwner       = &apperr.Forbidden{Detail: "Only workspace owners can do this."}
)

// ActiveSetter updates the session's active workspace (implemented by authsvc).
type ActiveSetter interface {
	SetActiveWorkspace(ctx context.Context, sessionHash []byte, workspaceID *string) error
}

type WorkspaceSvc struct {
	pool     *pgxpool.Pool
	sessions ActiveSetter
	log      *slog.Logger
	cleanup  MemberCleanup
}

func NewWorkspaceSvc(pool *pgxpool.Pool, sessions ActiveSetter, log *slog.Logger) *WorkspaceSvc {
	return &WorkspaceSvc{pool: pool, sessions: sessions, log: log}
}

// newInviteCode is 128 random bits, lowercase base32 without padding (26 chars).
func newInviteCode() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b))
}

// ValidateName mirrors the DB CHECK and the web client's validator.
func ValidateName(name string) (string, error) {
	name = strings.TrimSpace(name)
	switch n := utf8.RuneCountInString(name); {
	case n == 0:
		return "", apperr.Field("name", "Workspace name is required")
	case n > 100:
		return "", apperr.Field("name", "Workspace name must be 100 characters or fewer")
	}
	return name, nil
}

// List returns the caller's workspaces and the active one (nil if the
// session has none or the user is no longer a member).
func (s *WorkspaceSvc) List(ctx context.Context, userID string, activeID *string) ([]mdl.Workspace, *mdl.Workspace, error) {
	var list []mdl.Workspace
	err := db.WithUser(ctx, s.pool, userID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT w.id, w.name, w.invite_code, m.role
			  FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
			 WHERE m.user_id = $1
			 ORDER BY lower(w.name), w.id`, userID)
		if err != nil {
			return err
		}
		list, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (mdl.Workspace, error) {
			var w mdl.Workspace
			return w, r.Scan(&w.ID, &w.Name, &w.InviteCode, &w.Role)
		})
		return err
	})
	if err != nil {
		return nil, nil, fmt.Errorf("workspacesvc: list: %w", err)
	}
	var active *mdl.Workspace
	for i := range list {
		if activeID != nil && list[i].ID == *activeID {
			active = &list[i]
		}
	}
	return list, active, nil
}

// Membership returns the caller's role in a workspace, or ErrNotMember.
func (s *WorkspaceSvc) Membership(ctx context.Context, workspaceID, userID string) (string, error) {
	var role string
	err := db.WithTenant(ctx, s.pool, db.Tenant{WorkspaceID: workspaceID, UserID: userID}, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT role FROM memberships WHERE workspace_id = $1 AND user_id = $2`, workspaceID, userID).Scan(&role)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotMember
	}
	if isInvalidUUID(err) {
		return "", ErrNotMember
	}
	if err != nil {
		return "", fmt.Errorf("workspacesvc: membership: %w", err)
	}
	return role, nil
}

// Create makes a workspace owned by the caller and activates it.
func (s *WorkspaceSvc) Create(ctx context.Context, userID string, sessionHash []byte, rawName string) (mdl.Workspace, error) {
	name, err := ValidateName(rawName)
	if err != nil {
		return mdl.Workspace{}, err
	}
	w := mdl.Workspace{Name: name, Role: mdl.RoleOwner}
	for attempt := 0; ; attempt++ {
		w.InviteCode = newInviteCode()
		err = s.createTx(ctx, userID, &w)
		if !isUniqueViolation(err) || attempt >= 3 {
			break
		}
	}
	if err != nil {
		return mdl.Workspace{}, fmt.Errorf("workspacesvc: create: %w", err)
	}
	if err := s.sessions.SetActiveWorkspace(ctx, sessionHash, &w.ID); err != nil {
		return mdl.Workspace{}, err
	}
	s.log.Info("workspace_created", "workspace_id", w.ID, "user_id", userID)
	return w, nil
}

func (s *WorkspaceSvc) createTx(ctx context.Context, userID string, w *mdl.Workspace) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := tx.QueryRow(ctx,
		`INSERT INTO workspaces (name, invite_code, created_by) VALUES ($1, $2, $3) RETURNING id`,
		w.Name, w.InviteCode, userID).Scan(&w.ID); err != nil {
		return err
	}
	if err := db.SetTenant(ctx, tx, db.Tenant{WorkspaceID: w.ID, UserID: userID}); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'OWNER')`, w.ID, userID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Join adds the caller by invite code (idempotent) and activates it.
func (s *WorkspaceSvc) Join(ctx context.Context, userID string, sessionHash []byte, code string) (mdl.Workspace, error) {
	code = strings.ToLower(strings.TrimSpace(code))
	if code == "" {
		return mdl.Workspace{}, apperr.Field("inviteCode", "Invite code is required")
	}
	var w mdl.Workspace
	err := s.pool.QueryRow(ctx, `SELECT id, name, invite_code FROM workspaces WHERE invite_code = $1`, code).
		Scan(&w.ID, &w.Name, &w.InviteCode)
	if errors.Is(err, pgx.ErrNoRows) {
		return mdl.Workspace{}, ErrInviteNotFound
	}
	if err != nil {
		return mdl.Workspace{}, fmt.Errorf("workspacesvc: find invite: %w", err)
	}
	err = db.WithTenant(ctx, s.pool, db.Tenant{WorkspaceID: w.ID, UserID: userID}, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			WITH ins AS (
			  INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'MEMBER')
			  ON CONFLICT (workspace_id, user_id) DO NOTHING RETURNING role)
			SELECT role FROM ins
			UNION ALL SELECT role FROM memberships WHERE workspace_id = $1 AND user_id = $2
			LIMIT 1`, w.ID, userID).Scan(&w.Role)
	})
	if err != nil {
		return mdl.Workspace{}, fmt.Errorf("workspacesvc: join: %w", err)
	}
	if err := s.sessions.SetActiveWorkspace(ctx, sessionHash, &w.ID); err != nil {
		return mdl.Workspace{}, err
	}
	s.log.Info("workspace_joined", "workspace_id", w.ID, "user_id", userID)
	return w, nil
}

// Switch activates one of the caller's workspaces.
func (s *WorkspaceSvc) Switch(ctx context.Context, userID string, sessionHash []byte, workspaceID string) (mdl.Workspace, error) {
	list, _, err := s.List(ctx, userID, nil)
	if err != nil {
		return mdl.Workspace{}, err
	}
	for _, w := range list {
		if w.ID == workspaceID {
			if err := s.sessions.SetActiveWorkspace(ctx, sessionHash, &w.ID); err != nil {
				return mdl.Workspace{}, err
			}
			return w, nil
		}
	}
	return mdl.Workspace{}, ErrNotMember
}

// Members lists the active workspace's members.
func (s *WorkspaceSvc) Members(ctx context.Context, t db.Tenant) ([]mdl.Member, error) {
	var members []mdl.Member
	err := db.WithTenant(ctx, s.pool, t, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT u.id, u.name, u.email, u.image_url, m.role, m.joined_at
			  FROM memberships m JOIN users u ON u.id = m.user_id
			 WHERE m.workspace_id = $1
			 ORDER BY m.role = 'OWNER' DESC, lower(u.name), u.id`, t.WorkspaceID)
		if err != nil {
			return err
		}
		members, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (mdl.Member, error) {
			var m mdl.Member
			return m, r.Scan(&m.UserID, &m.Name, &m.Email, &m.ImageURL, &m.Role, &m.JoinedAt)
		})
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("workspacesvc: members: %w", err)
	}
	return members, nil
}

// RotateInviteCode replaces the invite code; owners only.
func (s *WorkspaceSvc) RotateInviteCode(ctx context.Context, t db.Tenant, role string) (string, error) {
	if role != mdl.RoleOwner {
		return "", ErrNotOwner
	}
	code := newInviteCode()
	if _, err := s.pool.Exec(ctx, `UPDATE workspaces SET invite_code = $2, updated_at = now() WHERE id = $1`, t.WorkspaceID, code); err != nil {
		return "", fmt.Errorf("workspacesvc: rotate invite: %w", err)
	}
	s.log.Info("invite_code_rotated", "workspace_id", t.WorkspaceID, "user_id", t.UserID)
	return code, nil
}

func isUniqueViolation(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "23505"
}

func isInvalidUUID(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "22P02"
}
