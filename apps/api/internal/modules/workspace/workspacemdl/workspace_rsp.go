package workspacemdl

import (
	"encoding/json"
	"time"
)

// WorkspaceRsp is api/openapi.yaml#Workspace.
type WorkspaceRsp struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Role string `json:"role"`
}

// ActiveWorkspaceRsp is api/openapi.yaml#ActiveWorkspace.
type ActiveWorkspaceRsp struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Role       string `json:"role"`
	InviteCode string `json:"inviteCode"`
}

// ListWorkspacesRsp is api/openapi.yaml#WorkspaceList.
type ListWorkspacesRsp struct {
	Workspaces []WorkspaceRsp      `json:"workspaces"`
	Active     *ActiveWorkspaceRsp `json:"active"`
}

func (r ListWorkspacesRsp) ToJSON() ([]byte, error) { return json.Marshal(r) }

// WorkspaceEnvelopeRsp is api/openapi.yaml#WorkspaceResponse.
type WorkspaceEnvelopeRsp struct {
	Workspace WorkspaceRsp `json:"workspace"`
}

func (r WorkspaceEnvelopeRsp) ToJSON() ([]byte, error) { return json.Marshal(r) }

// MemberRsp is api/openapi.yaml#Member.
type MemberRsp struct {
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	Email    string    `json:"email"`
	Image    *string   `json:"image"`
	Role     string    `json:"role"`
	JoinedAt time.Time `json:"joinedAt"`
}

// ListMembersRsp is api/openapi.yaml#MemberList.
type ListMembersRsp struct {
	Members []MemberRsp `json:"members"`
}

func (r ListMembersRsp) ToJSON() ([]byte, error) { return json.Marshal(r) }

// InviteCodeRsp is api/openapi.yaml#InviteCodeResponse.
type InviteCodeRsp struct {
	InviteCode string `json:"inviteCode"`
}

func (r InviteCodeRsp) ToJSON() ([]byte, error) { return json.Marshal(r) }

// MemberEnvelopeRsp is api/openapi.yaml#MemberResponse.
type MemberEnvelopeRsp struct {
	Member MemberRsp `json:"member"`
}

func (r MemberEnvelopeRsp) ToJSON() ([]byte, error) { return json.Marshal(r) }
