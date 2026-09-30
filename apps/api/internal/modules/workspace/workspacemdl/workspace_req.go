package workspacemdl

import "encoding/json"

// CreateWorkspaceReq is api/openapi.yaml#CreateWorkspaceRequest.
type CreateWorkspaceReq struct {
	Name string `json:"name"`
}

func (r CreateWorkspaceReq) ToJSON() ([]byte, error) { return json.Marshal(r) }

// JoinWorkspaceReq is api/openapi.yaml#JoinWorkspaceRequest.
type JoinWorkspaceReq struct {
	InviteCode string `json:"inviteCode"`
}

func (r JoinWorkspaceReq) ToJSON() ([]byte, error) { return json.Marshal(r) }

// SwitchWorkspaceReq is api/openapi.yaml#SwitchWorkspaceRequest.
type SwitchWorkspaceReq struct {
	WorkspaceID string `json:"workspaceId"`
}

func (r SwitchWorkspaceReq) ToJSON() ([]byte, error) { return json.Marshal(r) }

// UpdateMemberReq is api/openapi.yaml#UpdateMemberRequest.
type UpdateMemberReq struct {
	Role string `json:"role"`
}

func (r UpdateMemberReq) ToJSON() ([]byte, error) { return json.Marshal(r) }
