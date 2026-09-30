// Package taskmdl holds the task module's models (backend-go rule §9).
package taskmdl

import (
	"encoding/json"
	"time"
)

var (
	Statuses   = []string{"BACKLOG", "TODO", "IN_PROGRESS", "TESTING", "DONE", "CANCELED"}
	Priorities = []string{"URGENT", "HIGH", "MEDIUM", "LOW", "NONE"}
	// Sources of captured tasks (E10-S1).
	Sources = []string{"MEETING_NOTE", "PERSONAL"}
)

// Person is a user as shown on a task.
type Person struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Image *string `json:"image"`
}

// LabelRef is a label as shown on a task.
type LabelRef struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

// Task joins a tasks row with its people and labels.
type Task struct {
	ID          string
	Title       string
	Description *string
	Status      string
	Priority    string
	StartDate   time.Time
	EndDate     time.Time
	DueDate     *time.Time
	Assignees   []Person
	Owners      []Person
	Labels      []LabelRef
	CreatedBy   Person
	CreatedAt   time.Time
	UpdatedAt   time.Time
	Version     int
	Source      *string
	Client      *ClientRef
	Parent      *TaskRef
	Counts      Counts
	// Loaded for the detail view only.
	Subtasks    []TaskRef
	Checklist   []ChecklistItem
	Comments    []Comment
	Attachments []Attachment
	Requests    []ChangeRequest
}

func (t Task) ToJSON() ([]byte, error) { return json.Marshal(t) }

// Viewer is the caller's permissions on one task (E5-S1).
type Viewer struct {
	CanManage       bool `json:"canManage"`
	CanManageOwners bool `json:"canManageOwners"`
	IsAssignee      bool `json:"isAssignee"`
	// CanRequest: an assignee who can't manage proposes changes instead (E5-S2).
	CanRequest bool `json:"canRequest"`
}

func (v Viewer) ToJSON() ([]byte, error) { return json.Marshal(v) }

// Filter narrows GET /tasks.
type Filter struct {
	Status     string
	AssigneeID string
	LabelID    string
	ClientID   string
	ParentID   string
}
