package workspacesvc

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/intellicars/list-app/apps/api/internal/apperr"
	"github.com/intellicars/list-app/apps/api/internal/db"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/workspace/workspacemdl"
	"github.com/intellicars/list-app/apps/api/internal/uuidx"
)

var (
	ErrLastOwner      = &apperr.Conflict{Type: "last_owner", Detail: "You're the only owner. Make someone else an owner first."}
	ErrMemberNotFound = &apperr.NotFound{Detail: "This person isn't a member of the workspace."}
	ErrBadRole        = apperr.Field("role", "Choose owner or member")
)

// MemberCleanup detaches a person from workspace content in tx (implemented
// by tasksvc.RemoveMemberTx; injected to keep modules decoupled, ADR-0024).
type MemberCleanup func(ctx context.Context, tx pgx.Tx, workspaceID, actorID, userID, name string) error

// SetMemberCleanup wires the cleanup run when someone leaves or is removed.
func (s *WorkspaceSvc) SetMemberCleanup(fn MemberCleanup) { s.cleanup = fn }

// lockMember returns the member's name and role, locking the membership row
// (and every owner row, so two owners can't both leave at once).
func lockMember(ctx context.Context, tx pgx.Tx, workspaceID, userID string) (name, role string, owners int, err error) {
	if !uuidx.Valid(userID) {
		return "", "", 0, ErrMemberNotFound
	}
	if _, err = tx.Exec(ctx, `SELECT 1 FROM memberships WHERE workspace_id = $1 AND (role = 'OWNER' OR user_id = $2) FOR UPDATE`,
		workspaceID, userID); err != nil {
		return "", "", 0, err
	}
	err = tx.QueryRow(ctx, `
		SELECT u.name, m.role, (SELECT count(*) FROM memberships o WHERE o.workspace_id = $1 AND o.role = 'OWNER')
		  FROM memberships m JOIN users u ON u.id = m.user_id
		 WHERE m.workspace_id = $1 AND m.user_id = $2`, workspaceID, userID).Scan(&name, &role, &owners)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", 0, ErrMemberNotFound
	}
	return name, role, owners, err
}

// Leave removes the caller from the active workspace.
func (s *WorkspaceSvc) Leave(ctx context.Context, t db.Tenant) error {
	return s.remove(ctx, t, t.UserID)
}

// RemoveMember removes someone else (workspace owners only).
func (s *WorkspaceSvc) RemoveMember(ctx context.Context, t db.Tenant, role, userID string) error {
	if userID == t.UserID {
		return s.Leave(ctx, t)
	}
	if role != mdl.RoleOwner {
		return ErrNotOwner
	}
	return s.remove(ctx, t, userID)
}

func (s *WorkspaceSvc) remove(ctx context.Context, t db.Tenant, userID string) error {
	err := db.WithTenant(ctx, s.pool, t, func(tx pgx.Tx) error {
		name, role, owners, err := lockMember(ctx, tx, t.WorkspaceID, userID)
		if err != nil {
			return err
		}
		if role == mdl.RoleOwner && owners <= 1 {
			return ErrLastOwner
		}
		if s.cleanup != nil {
			if err := s.cleanup(ctx, tx, t.WorkspaceID, t.UserID, userID, name); err != nil {
				return err
			}
		}
		_, err = tx.Exec(ctx, `DELETE FROM memberships WHERE workspace_id = $1 AND user_id = $2`, t.WorkspaceID, userID)
		return err
	})
	if err != nil {
		return wrapErr("remove_member", err)
	}
	// Point the person's sessions at another workspace they belong to (or
	// none, which leads to onboarding). Runs as that user for RLS.
	if err := db.WithUser(ctx, s.pool, userID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			UPDATE sessions SET active_workspace_id = (
			         SELECT workspace_id FROM memberships WHERE user_id = $1 ORDER BY joined_at DESC LIMIT 1)
			 WHERE user_id = $1 AND active_workspace_id = $2`, userID, t.WorkspaceID)
		return err
	}); err != nil {
		return fmt.Errorf("workspacesvc: move sessions: %w", err)
	}
	s.log.Info("member_removed", "workspace_id", t.WorkspaceID, "user_id", userID, "actor_id", t.UserID)
	return nil
}

// SetRole promotes or demotes a member (owners only; never the last owner).
func (s *WorkspaceSvc) SetRole(ctx context.Context, t db.Tenant, callerRole, userID, newRole string) (mdl.Member, error) {
	if callerRole != mdl.RoleOwner {
		return mdl.Member{}, ErrNotOwner
	}
	if newRole != mdl.RoleOwner && newRole != mdl.RoleMember {
		return mdl.Member{}, ErrBadRole
	}
	var out mdl.Member
	err := db.WithTenant(ctx, s.pool, t, func(tx pgx.Tx) error {
		_, role, owners, err := lockMember(ctx, tx, t.WorkspaceID, userID)
		if err != nil {
			return err
		}
		if role == mdl.RoleOwner && newRole == mdl.RoleMember && owners <= 1 {
			return ErrLastOwner
		}
		if _, err := tx.Exec(ctx, `UPDATE memberships SET role = $3 WHERE workspace_id = $1 AND user_id = $2`,
			t.WorkspaceID, userID, newRole); err != nil {
			return err
		}
		return tx.QueryRow(ctx, `
			SELECT u.id, u.name, u.email, u.image_url, m.role, m.joined_at
			  FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = $1 AND m.user_id = $2`,
			t.WorkspaceID, userID).Scan(&out.UserID, &out.Name, &out.Email, &out.ImageURL, &out.Role, &out.JoinedAt)
	})
	if err != nil {
		return mdl.Member{}, wrapErr("set_role", err)
	}
	s.log.Info("member_role_changed", "workspace_id", t.WorkspaceID, "user_id", userID, "role", newRole, "actor_id", t.UserID)
	return out, nil
}

func wrapErr(op string, err error) error {
	var (
		v *apperr.Validation
		n *apperr.NotFound
		f *apperr.Forbidden
		c *apperr.Conflict
	)
	if errors.As(err, &v) || errors.As(err, &n) || errors.As(err, &f) || errors.As(err, &c) {
		return err
	}
	return fmt.Errorf("workspacesvc: %s: %w", op, err)
}
