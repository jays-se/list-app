// Package docmdl holds the docs module's models (E11, ADR-0025).
package docmdl

import (
	"encoding/json"
	"time"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
	taskmdl "github.com/intellicars/list-app/apps/api/internal/modules/task/taskmdl"
)

// Doc joins a docs row with people, client and files. Files reuse the task
// attachment shape (api/openapi.yaml#Attachment).
type Doc struct {
	ID        string
	Title     string
	Content   string
	Client    *taskmdl.ClientRef
	CreatedBy *taskmdl.Person
	UpdatedBy *taskmdl.Person
	CreatedAt time.Time
	UpdatedAt time.Time
	Version   int
	FileCount int
	Files     []taskmdl.Attachment
}

func (d Doc) ToJSON() ([]byte, error) { return json.Marshal(d) }

// DocViewer is api/openapi.yaml#DocViewer.
type DocViewer struct {
	CanDelete bool `json:"canDelete"`
}

// DocSummaryRsp is api/openapi.yaml#DocSummary (no full content).
type DocSummaryRsp struct {
	ID        string             `json:"id"`
	Title     string             `json:"title"`
	Excerpt   string             `json:"excerpt"`
	Client    *taskmdl.ClientRef `json:"client"`
	CreatedBy *taskmdl.Person    `json:"createdBy"`
	UpdatedBy *taskmdl.Person    `json:"updatedBy"`
	UpdatedAt time.Time          `json:"updatedAt"`
	Version   int                `json:"version"`
	FileCount int                `json:"fileCount"`
}

// DocRsp is api/openapi.yaml#Doc.
type DocRsp struct {
	ID        string               `json:"id"`
	Title     string               `json:"title"`
	Content   string               `json:"content"`
	Client    *taskmdl.ClientRef   `json:"client"`
	CreatedBy *taskmdl.Person      `json:"createdBy"`
	UpdatedBy *taskmdl.Person      `json:"updatedBy"`
	CreatedAt time.Time            `json:"createdAt"`
	UpdatedAt time.Time            `json:"updatedAt"`
	Version   int                  `json:"version"`
	Files     []taskmdl.Attachment `json:"files"`
	Viewer    DocViewer            `json:"viewer"`
}

type ListDocsRsp struct {
	Docs []DocSummaryRsp `json:"docs"`
}

func (r ListDocsRsp) ToJSON() ([]byte, error) { return json.Marshal(r) }

type DocEnvelopeRsp struct {
	Doc DocRsp `json:"doc"`
}

func (r DocEnvelopeRsp) ToJSON() ([]byte, error) { return json.Marshal(r) }

// CreateDocReq is api/openapi.yaml#CreateDocRequest.
type CreateDocReq struct {
	Title    string  `json:"title"`
	Content  string  `json:"content"`
	ClientID *string `json:"clientId"`
}

func (r CreateDocReq) ToJSON() ([]byte, error) { return json.Marshal(r) }

// UpdateDocReq is api/openapi.yaml#UpdateDocRequest (present fields change).
type UpdateDocReq struct {
	Title    apiserver.Optional[string]  `json:"title"`
	Content  apiserver.Optional[string]  `json:"content"`
	ClientID apiserver.Optional[*string] `json:"clientId"`
}

func (r UpdateDocReq) ToJSON() ([]byte, error) { return json.Marshal(r) }

func excerpt(content string) string {
	r := []rune(content)
	if len(r) > 280 {
		return string(r[:280])
	}
	return content
}

func ToDocSummaryRsp(d Doc) DocSummaryRsp {
	return DocSummaryRsp{ID: d.ID, Title: d.Title, Excerpt: excerpt(d.Content), Client: d.Client,
		CreatedBy: d.CreatedBy, UpdatedBy: d.UpdatedBy, UpdatedAt: d.UpdatedAt, Version: d.Version, FileCount: d.FileCount}
}

func ToDocRsp(d Doc, v DocViewer) DocRsp {
	files := d.Files
	if files == nil {
		files = []taskmdl.Attachment{}
	}
	return DocRsp{ID: d.ID, Title: d.Title, Content: d.Content, Client: d.Client, CreatedBy: d.CreatedBy,
		UpdatedBy: d.UpdatedBy, CreatedAt: d.CreatedAt, UpdatedAt: d.UpdatedAt, Version: d.Version, Files: files, Viewer: v}
}
