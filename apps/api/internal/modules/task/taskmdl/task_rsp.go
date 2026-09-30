package taskmdl

import (
	"encoding/json"
	"time"
)

// TaskSummaryRsp is api/openapi.yaml#TaskSummary.
type TaskSummaryRsp struct {
	ID        string     `json:"id"`
	Title     string     `json:"title"`
	Status    string     `json:"status"`
	Priority  string     `json:"priority"`
	StartDate string     `json:"startDate"`
	EndDate   string     `json:"endDate"`
	DueDate   *string    `json:"dueDate"`
	Assignees []Person   `json:"assignees"`
	Labels    []LabelRef `json:"labels"`
	CreatedBy Person     `json:"createdBy"`
	Version   int        `json:"version"`
	UpdatedAt time.Time  `json:"updatedAt"`
	Client    *ClientRef `json:"client"`
	Parent    *TaskRef   `json:"parent"`
	Counts    Counts     `json:"counts"`
}

// TaskRsp is api/openapi.yaml#Task.
type TaskRsp struct {
	ID          string          `json:"id"`
	Title       string          `json:"title"`
	Description *string         `json:"description"`
	Status      string          `json:"status"`
	Priority    string          `json:"priority"`
	StartDate   string          `json:"startDate"`
	EndDate     string          `json:"endDate"`
	DueDate     *string         `json:"dueDate"`
	Assignees   []Person        `json:"assignees"`
	Owners      []Person        `json:"owners"`
	Labels      []LabelRef      `json:"labels"`
	CreatedBy   Person          `json:"createdBy"`
	CreatedAt   time.Time       `json:"createdAt"`
	UpdatedAt   time.Time       `json:"updatedAt"`
	Version     int             `json:"version"`
	Viewer      Viewer          `json:"viewer"`
	Client      *ClientRef      `json:"client"`
	Parent      *TaskRef        `json:"parent"`
	Subtasks    []TaskRef       `json:"subtasks"`
	Checklist   []ChecklistItem `json:"checklist"`
	Comments    []Comment       `json:"comments"`
	Attachments []Attachment    `json:"attachments"`
}

// ListTasksRsp is api/openapi.yaml#TaskList.
type ListTasksRsp struct {
	Tasks []TaskSummaryRsp `json:"tasks"`
}

func (r ListTasksRsp) ToJSON() ([]byte, error) { return json.Marshal(r) }

// TaskEnvelopeRsp is api/openapi.yaml#TaskResponse.
type TaskEnvelopeRsp struct {
	Task TaskRsp `json:"task"`
}

func (r TaskEnvelopeRsp) ToJSON() ([]byte, error) { return json.Marshal(r) }
