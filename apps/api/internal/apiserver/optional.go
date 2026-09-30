package apiserver

import (
	"bytes"
	"encoding/json"
)

// Optional distinguishes "field absent" from "field present" in PATCH bodies.
// For nullable fields use Optional[*T]: Set && Value == nil means JSON null.
type Optional[T any] struct {
	Set   bool
	Value T
}

func (o *Optional[T]) UnmarshalJSON(b []byte) error {
	o.Set = true
	if bytes.Equal(b, []byte("null")) {
		var zero T
		o.Value = zero
		return nil
	}
	return json.Unmarshal(b, &o.Value)
}

// Some builds a present Optional (tests, internal callers).
func Some[T any](v T) Optional[T] { return Optional[T]{Set: true, Value: v} }
