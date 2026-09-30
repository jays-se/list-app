// Package workspacemdl holds the workspace module's models (backend-go rule §9).
package workspacemdl

import (
	"encoding/json"
	"time"
)

const (
	RoleOwner  = "OWNER"
	RoleMember = "MEMBER"
)

// Workspace joins a workspaces row with the caller's membership role.
type Workspace struct {
	ID         string
	Name       string
	InviteCode string
	Role       string
}

func (w Workspace) ToJSON() ([]byte, error) { return json.Marshal(w) }

// Member joins a memberships row with its user.
type Member struct {
	UserID   string
	Name     string
	Email    string
	ImageURL *string
	Role     string
	JoinedAt time.Time
}

func (m Member) ToJSON() ([]byte, error) { return json.Marshal(m) }
