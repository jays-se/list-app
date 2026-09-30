// Package clientmdl holds the client module's models (backend-go rule §9).
package clientmdl

import "encoding/json"

// Client is the clients row plus its linked-task count.
type Client struct {
	ID        string
	Name      string
	Email     *string
	Phone     *string
	Color     string
	Notes     *string
	TaskCount int
	DocCount  int
}

func (c Client) ToJSON() ([]byte, error) { return json.Marshal(c) }

// ClientInput is api/openapi.yaml#ClientInput (create and replace).
type ClientInput struct {
	Name  string  `json:"name"`
	Email *string `json:"email"`
	Phone *string `json:"phone"`
	Color string  `json:"color"`
	Notes *string `json:"notes"`
}

func (r ClientInput) ToJSON() ([]byte, error) { return json.Marshal(r) }

// ClientRsp is api/openapi.yaml#Client.
type ClientRsp struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Email     *string `json:"email"`
	Phone     *string `json:"phone"`
	Color     string  `json:"color"`
	Notes     *string `json:"notes"`
	TaskCount int     `json:"taskCount"`
	DocCount  int     `json:"docCount"`
}

type ListClientsRsp struct {
	Clients []ClientRsp `json:"clients"`
}

func (r ListClientsRsp) ToJSON() ([]byte, error) { return json.Marshal(r) }

type ClientEnvelopeRsp struct {
	Client ClientRsp `json:"client"`
}

func (r ClientEnvelopeRsp) ToJSON() ([]byte, error) { return json.Marshal(r) }

func ToClientRsp(c Client) ClientRsp {
	return ClientRsp{ID: c.ID, Name: c.Name, Email: c.Email, Phone: c.Phone, Color: c.Color, Notes: c.Notes, TaskCount: c.TaskCount, DocCount: c.DocCount}
}

func ToClientRspList(cs []Client) []ClientRsp {
	out := make([]ClientRsp, 0, len(cs))
	for _, c := range cs {
		out = append(out, ToClientRsp(c))
	}
	return out
}
