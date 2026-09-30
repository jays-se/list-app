package taskmdl

import (
	"encoding/json"
	"time"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
)

// ClientRef is api/openapi.yaml#ClientRef.
type ClientRef struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

// TaskRef is api/openapi.yaml#TaskRef.
type TaskRef struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Status string `json:"status"`
}

// Counts is api/openapi.yaml#TaskCounts.
type Counts struct {
	Subtasks      int `json:"subtasks"`
	SubtasksDone  int `json:"subtasksDone"`
	Checklist     int `json:"checklist"`
	ChecklistDone int `json:"checklistDone"`
	Comments      int `json:"comments"`
	Attachments   int `json:"attachments"`
}

// ChecklistItem is api/openapi.yaml#ChecklistItem.
type ChecklistItem struct {
	ID       string  `json:"id"`
	Title    string  `json:"title"`
	Done     bool    `json:"done"`
	Assignee *Person `json:"assignee"`
}

// Comment is api/openapi.yaml#Comment.
type Comment struct {
	ID        string    `json:"id"`
	Body      string    `json:"body"`
	Author    *Person   `json:"author"`
	Mentions  []Person  `json:"mentions"`
	CreatedAt time.Time `json:"createdAt"`
}

// Attachment is api/openapi.yaml#Attachment.
type Attachment struct {
	ID          string    `json:"id"`
	Filename    string    `json:"filename"`
	MimeType    string    `json:"mimeType"`
	Size        int64     `json:"size"`
	UploadedBy  *Person   `json:"uploadedBy"`
	CreatedAt   time.Time `json:"createdAt"`
	DownloadURL string    `json:"downloadUrl"`
}

// Event is api/openapi.yaml#TaskEvent.
type Event struct {
	ID        string    `json:"id"`
	Kind      string    `json:"kind"`
	Field     *string   `json:"field"`
	From      *string   `json:"from"`
	To        *string   `json:"to"`
	Subject   *string   `json:"subject"`
	Actor     *Person   `json:"actor"`
	CreatedAt time.Time `json:"createdAt"`
}

// Stage is api/openapi.yaml#StatusStage.
type Stage struct {
	Status    string     `json:"status"`
	EnteredAt time.Time  `json:"enteredAt"`
	LeftAt    *time.Time `json:"leftAt"`
}

// --- requests ---

type CreateChecklistItemReq struct {
	Title      string  `json:"title"`
	AssigneeID *string `json:"assigneeId"`
}

func (r CreateChecklistItemReq) ToJSON() ([]byte, error) { return json.Marshal(r) }

type UpdateChecklistItemReq struct {
	Title      apiserver.Optional[string]  `json:"title"`
	Done       apiserver.Optional[bool]    `json:"done"`
	AssigneeID apiserver.Optional[*string] `json:"assigneeId"`
}

func (r UpdateChecklistItemReq) ToJSON() ([]byte, error) { return json.Marshal(r) }

type CreateCommentReq struct {
	Body             string   `json:"body"`
	MentionedUserIDs []string `json:"mentionedUserIds"`
}

func (r CreateCommentReq) ToJSON() ([]byte, error) { return json.Marshal(r) }

type CreateAttachmentReq struct {
	Filename string `json:"filename"`
	MimeType string `json:"mimeType"`
	Size     int64  `json:"size"`
}

func (r CreateAttachmentReq) ToJSON() ([]byte, error) { return json.Marshal(r) }

// --- responses ---

type ChecklistItemEnvelopeRsp struct {
	Item ChecklistItem `json:"item"`
}

type CommentEnvelopeRsp struct {
	Comment Comment `json:"comment"`
}

type AttachmentEnvelopeRsp struct {
	Attachment Attachment `json:"attachment"`
}

// UploadTargetRsp is api/openapi.yaml#UploadTarget.
type UploadTargetRsp struct {
	Method  string            `json:"method"`
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers"`
}

type AttachmentUploadRsp struct {
	Attachment Attachment      `json:"attachment"`
	Upload     UploadTargetRsp `json:"upload"`
}

type HistoryRsp struct {
	Events []Event `json:"events"`
	Stages []Stage `json:"stages"`
}

func (r HistoryRsp) ToJSON() ([]byte, error) { return json.Marshal(r) }
