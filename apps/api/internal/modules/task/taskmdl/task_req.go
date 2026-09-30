package taskmdl

import (
	"encoding/json"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
)

// CreateTaskReq is api/openapi.yaml#CreateTaskRequest.
type CreateTaskReq struct {
	Title       string   `json:"title"`
	Description *string  `json:"description"`
	Status      string   `json:"status"`
	Priority    string   `json:"priority"`
	StartDate   string   `json:"startDate"`
	EndDate     string   `json:"endDate"`
	DueDate     *string  `json:"dueDate"`
	AssigneeIDs []string `json:"assigneeIds"`
	LabelIDs    []string `json:"labelIds"`
	ClientID    *string  `json:"clientId"`
	ParentID    *string  `json:"parentId"`
}

func (r CreateTaskReq) ToJSON() ([]byte, error) { return json.Marshal(r) }

// UpdateTaskReq is api/openapi.yaml#UpdateTaskRequest (only present fields change).
type UpdateTaskReq struct {
	Title       apiserver.Optional[string]  `json:"title"`
	Description apiserver.Optional[*string] `json:"description"`
	Status      apiserver.Optional[string]  `json:"status"`
	Priority    apiserver.Optional[string]  `json:"priority"`
	StartDate   apiserver.Optional[string]  `json:"startDate"`
	EndDate     apiserver.Optional[string]  `json:"endDate"`
	DueDate     apiserver.Optional[*string] `json:"dueDate"`
	ClientID    apiserver.Optional[*string] `json:"clientId"`
}

func (r UpdateTaskReq) ToJSON() ([]byte, error) { return json.Marshal(r) }

// UserIDsReq is api/openapi.yaml#UserIdsRequest.
type UserIDsReq struct {
	UserIDs []string `json:"userIds"`
}

func (r UserIDsReq) ToJSON() ([]byte, error) { return json.Marshal(r) }

// LabelIDsReq is api/openapi.yaml#LabelIdsRequest.
type LabelIDsReq struct {
	LabelIDs []string `json:"labelIds"`
}

func (r LabelIDsReq) ToJSON() ([]byte, error) { return json.Marshal(r) }
