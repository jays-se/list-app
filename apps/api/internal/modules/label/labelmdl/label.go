// Package labelmdl holds the label module's models (backend-go rule §9).
package labelmdl

import "encoding/json"

// Colors are palette keys; the web maps them to ui-kit tokens.
var Colors = []string{"gray", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"}

// Label is the labels table row.
type Label struct {
	ID    string
	Name  string
	Color string
}

func (l Label) ToJSON() ([]byte, error) { return json.Marshal(l) }

// CreateLabelReq is api/openapi.yaml#CreateLabelRequest.
type CreateLabelReq struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

func (r CreateLabelReq) ToJSON() ([]byte, error) { return json.Marshal(r) }

// LabelRsp is api/openapi.yaml#Label.
type LabelRsp struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

// ListLabelsRsp is api/openapi.yaml#LabelList.
type ListLabelsRsp struct {
	Labels []LabelRsp `json:"labels"`
}

func (r ListLabelsRsp) ToJSON() ([]byte, error) { return json.Marshal(r) }

// LabelEnvelopeRsp is api/openapi.yaml#LabelResponse.
type LabelEnvelopeRsp struct {
	Label LabelRsp `json:"label"`
}

func (r LabelEnvelopeRsp) ToJSON() ([]byte, error) { return json.Marshal(r) }

func ToLabelRsp(l Label) LabelRsp { return LabelRsp{ID: l.ID, Name: l.Name, Color: l.Color} }

func ToLabelRspList(ls []Label) []LabelRsp {
	out := make([]LabelRsp, 0, len(ls))
	for _, l := range ls {
		out = append(out, ToLabelRsp(l))
	}
	return out
}
