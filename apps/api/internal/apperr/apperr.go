// Package apperr defines the domain errors services return and maps them to
// problem+json in one place, so every module answers errors the same way.
package apperr

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
	"github.com/intellicars/list-app/apps/api/pkg/logger"
)

// Validation carries field errors → 422.
type Validation struct{ Fields []apiserver.FieldError }

func (e *Validation) Error() string { return "validation failed" }

// Field is shorthand for a single-field validation error.
func Field(field, message string) *Validation {
	return &Validation{Fields: []apiserver.FieldError{{Field: field, Message: message}}}
}

// Kinded errors carry a user-safe message.
type (
	NotFound     struct{ Detail string }
	Forbidden    struct{ Detail string }
	Conflict     struct{ Type, Detail string }
	Precondition struct{ Detail string }
)

func (e *NotFound) Error() string     { return "not found: " + e.Detail }
func (e *Forbidden) Error() string    { return "forbidden: " + e.Detail }
func (e *Conflict) Error() string     { return "conflict: " + e.Detail }
func (e *Precondition) Error() string { return "precondition required: " + e.Detail }

// Respond writes the problem for err and returns true, or returns false for
// nil. Unknown errors are logged and answered with a generic 500.
func Respond(w http.ResponseWriter, r *http.Request, log *slog.Logger, op string, err error) bool {
	var (
		validation   *Validation
		notFound     *NotFound
		forbidden    *Forbidden
		conflict     *Conflict
		precondition *Precondition
	)
	switch {
	case err == nil:
		return false
	case errors.As(err, &validation):
		apiserver.RespondValidation(w, r, validation.Fields)
	case errors.As(err, &notFound):
		apiserver.RespondNotFound(w, r, notFound.Detail)
	case errors.As(err, &forbidden):
		apiserver.RespondForbidden(w, r, "forbidden", forbidden.Detail)
	case errors.As(err, &conflict):
		t := conflict.Type
		if t == "" {
			t = "conflict"
		}
		apiserver.RespondConflict(w, r, t, conflict.Detail)
	case errors.As(err, &precondition):
		apiserver.RespondProblem(w, r, apiserver.Problem{
			Type: "precondition_required", Status: http.StatusPreconditionRequired, Detail: precondition.Detail,
		})
	default:
		logger.FromContext(r.Context(), log).Error(op+"_failed", "error", err)
		apiserver.RespondInternalError(w, r)
	}
	return true
}
