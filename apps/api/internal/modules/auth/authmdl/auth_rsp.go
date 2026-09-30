package authmdl

import "encoding/json"

// UserRsp is api/openapi.yaml#User.
type UserRsp struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Email string  `json:"email"`
	Image *string `json:"image"`
}

func (r UserRsp) ToJSON() ([]byte, error) { return json.Marshal(r) }

// MeRsp is api/openapi.yaml#MeResponse.
type MeRsp struct {
	User UserRsp `json:"user"`
}

func (r MeRsp) ToJSON() ([]byte, error) { return json.Marshal(r) }
