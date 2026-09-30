package apiserver

import (
	"encoding/json"
	"net/http"
)

// FieldError is one invalid input field in a validation problem.
type FieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// Problem is an RFC 7807 problem details body (api/openapi.yaml#Problem).
type Problem struct {
	Type      string       `json:"type"`
	Title     string       `json:"title"`
	Status    int          `json:"status"`
	Detail    string       `json:"detail,omitempty"`
	Instance  string       `json:"instance,omitempty"`
	RequestID string       `json:"requestId,omitempty"`
	Errors    []FieldError `json:"errors,omitempty"`
}

// RespondJSON writes v as JSON with the given status.
func RespondJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func RespondOK(w http.ResponseWriter, v any)      { RespondJSON(w, http.StatusOK, v) }
func RespondCreated(w http.ResponseWriter, v any) { RespondJSON(w, http.StatusCreated, v) }
func RespondNoContent(w http.ResponseWriter)      { w.WriteHeader(http.StatusNoContent) }

// RespondProblem writes an application/problem+json error. The request ID and
// path are filled in from the request when not set.
func RespondProblem(w http.ResponseWriter, r *http.Request, p Problem) {
	if p.Title == "" {
		p.Title = http.StatusText(p.Status)
	}
	if p.Type == "" {
		p.Type = "about:blank"
	}
	if p.RequestID == "" {
		p.RequestID = RequestIDFrom(r.Context())
	}
	if p.Instance == "" {
		p.Instance = r.URL.Path
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(p.Status)
	_ = json.NewEncoder(w).Encode(p)
}

func RespondBadRequest(w http.ResponseWriter, r *http.Request, problemType, detail string) {
	RespondProblem(w, r, Problem{Type: problemType, Status: http.StatusBadRequest, Detail: detail})
}

func RespondValidation(w http.ResponseWriter, r *http.Request, errs []FieldError) {
	detail := "The request is invalid."
	if len(errs) > 0 {
		detail = errs[0].Message
	}
	RespondProblem(w, r, Problem{
		Type: "validation", Status: http.StatusUnprocessableEntity, Detail: detail, Errors: errs,
	})
}

func RespondNotFound(w http.ResponseWriter, r *http.Request, detail string) {
	RespondProblem(w, r, Problem{Type: "not_found", Status: http.StatusNotFound, Detail: detail})
}

// RespondInternalError never leaks internal details; log the cause separately.
func RespondInternalError(w http.ResponseWriter, r *http.Request) {
	RespondProblem(w, r, Problem{
		Type: "internal", Status: http.StatusInternalServerError, Detail: "Something went wrong.",
	})
}
