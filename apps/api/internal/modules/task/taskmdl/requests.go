package taskmdl

import (
	"encoding/json"
	"time"
)

// Change-request kinds and statuses (api/openapi.yaml#ChangeRequestKind, ADR-0023).
var (
	RequestKinds = []string{"UPDATE", "ASSIGNEE_ADD", "ASSIGNEE_REMOVE", "SUBTASK_ADD",
		"CHECKLIST_ADD", "CHECKLIST_UPDATE", "CHECKLIST_REMOVE", "ATTACHMENT_REMOVE"}
	// RequestFields are the task fields an assignee may request to change.
	RequestFields = []string{"status", "startDate", "endDate", "dueDate"}
)

// RequestPayload is api/openapi.yaml#ChangeRequestPayload: one flat object
// whose required members depend on the kind (validated by tasksvc).
type RequestPayload struct {
	Field        *string `json:"field,omitempty"`
	Value        *string `json:"value,omitempty"`
	From         *string `json:"from,omitempty"`
	UserID       *string `json:"userId,omitempty"`
	Title        *string `json:"title,omitempty"`
	ItemID       *string `json:"itemId,omitempty"`
	Done         *bool   `json:"done,omitempty"`
	AttachmentID *string `json:"attachmentId,omitempty"`
}

// ChangeRequest is api/openapi.yaml#ChangeRequest.
type ChangeRequest struct {
	ID         string         `json:"id"`
	Kind       string         `json:"kind"`
	Status     string         `json:"status"`
	Payload    RequestPayload `json:"payload"`
	Summary    string         `json:"summary"`
	Note       *string        `json:"note"`
	ReviewNote *string        `json:"reviewNote"`
	Requester  *Person        `json:"requester"`
	Reviewer   *Person        `json:"reviewer"`
	CreatedAt  time.Time      `json:"createdAt"`
	DecidedAt  *time.Time     `json:"decidedAt"`
}

func (r ChangeRequest) ToJSON() ([]byte, error) { return json.Marshal(r) }

// CreateRequestReq is api/openapi.yaml#CreateChangeRequest.
type CreateRequestReq struct {
	Kind    string         `json:"kind"`
	Payload RequestPayload `json:"payload"`
	Note    *string        `json:"note"`
}

func (r CreateRequestReq) ToJSON() ([]byte, error) { return json.Marshal(r) }

// ReviewRequestReq is api/openapi.yaml#ReviewChangeRequest.
type ReviewRequestReq struct {
	Note *string `json:"note"`
}

func (r ReviewRequestReq) ToJSON() ([]byte, error) { return json.Marshal(r) }
