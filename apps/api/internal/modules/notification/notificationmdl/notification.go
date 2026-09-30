// Package notificationmdl holds the notification module's models (E9).
package notificationmdl

import (
	"encoding/json"
	"time"
)

var Kinds = []string{"MENTION", "ASSIGNED", "STATUS", "DUE", "REQUEST", "REVIEWED"}

type Person struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Image *string `json:"image"`
}

type TaskRef struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

// Notification is api/openapi.yaml#Notification. Task is null once the
// task is deleted; TaskTitle keeps the title it had when notified.
type Notification struct {
	ID          string     `json:"id"`
	Kind        string     `json:"kind"`
	Task        *TaskRef   `json:"task"`
	TaskTitle   *string    `json:"taskTitle"`
	Actor       *Person    `json:"actor"`
	Detail      string     `json:"detail"`
	CommentBody *string    `json:"commentBody"`
	CreatedAt   time.Time  `json:"createdAt"`
	ReadAt      *time.Time `json:"readAt"`
}

func (n Notification) ToJSON() ([]byte, error) { return json.Marshal(n) }

// ListRsp is api/openapi.yaml#NotificationList.
type ListRsp struct {
	Notifications []Notification `json:"notifications"`
	Unread        int            `json:"unread"`
}

func (r ListRsp) ToJSON() ([]byte, error) { return json.Marshal(r) }

// Setting is api/openapi.yaml#NotificationSetting.
type Setting struct {
	Kind    string `json:"kind"`
	Enabled bool   `json:"enabled"`
}

// SettingsRsp / SettingsReq are api/openapi.yaml#NotificationSettings.
type SettingsRsp struct {
	Settings []Setting `json:"settings"`
}

func (r SettingsRsp) ToJSON() ([]byte, error) { return json.Marshal(r) }

type SettingsReq = SettingsRsp
