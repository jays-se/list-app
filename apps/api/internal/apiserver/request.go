package apiserver

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"
)

const maxJSONBody = 1 << 20

// DecodeJSON reads a JSON request body into dst. On failure it writes a 400
// problem and returns false, so handlers can simply `return`.
func DecodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	if mt, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type")); mt != "application/json" {
		RespondProblem(w, r, Problem{
			Type: "unsupported_media_type", Status: http.StatusUnsupportedMediaType,
			Detail: "Send the body as application/json.",
		})
		return false
	}
	dec := json.NewDecoder(io.LimitReader(r.Body, maxJSONBody))
	if err := dec.Decode(dst); err != nil {
		detail := "The request body is not valid JSON."
		var typeErr *json.UnmarshalTypeError
		if errors.As(err, &typeErr) {
			detail = "Field \"" + typeErr.Field + "\" has the wrong type."
		}
		RespondBadRequest(w, r, "invalid_body", detail)
		return false
	}
	return true
}

// RespondUnauthorized matches the reference API's shape for signed-out calls.
func RespondUnauthorized(w http.ResponseWriter, r *http.Request) {
	RespondProblem(w, r, Problem{
		Type: "unauthenticated", Title: "Unauthorized", Status: http.StatusUnauthorized,
		Detail: "sign in required",
	})
}

func RespondForbidden(w http.ResponseWriter, r *http.Request, problemType, detail string) {
	RespondProblem(w, r, Problem{Type: problemType, Status: http.StatusForbidden, Detail: detail})
}

func RespondConflict(w http.ResponseWriter, r *http.Request, problemType, detail string) {
	RespondProblem(w, r, Problem{Type: problemType, Status: http.StatusConflict, Detail: detail})
}

// CSRF protects unsafe /api/ requests (ADR-0008): they must carry
// `X-Requested-With: app`, must not be cross-site per Sec-Fetch-Site, and any
// Origin header must equal allowedOrigin. `exempt` skips the check (the dev
// identity provider's HTML form post).
func CSRF(allowedOrigin string, exempt func(*http.Request) bool) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if isSafeMethod(r.Method) || !strings.HasPrefix(r.URL.Path, "/api/") || (exempt != nil && exempt(r)) {
				next.ServeHTTP(w, r)
				return
			}
			origin := r.Header.Get("Origin")
			switch {
			case r.Header.Get("X-Requested-With") != "app":
				RespondForbidden(w, r, "csrf", "Missing X-Requested-With header.")
			case r.Header.Get("Sec-Fetch-Site") == "cross-site":
				RespondForbidden(w, r, "csrf", "Cross-site requests are not allowed.")
			case origin != "" && origin != allowedOrigin:
				RespondForbidden(w, r, "csrf", "Origin not allowed.")
			default:
				next.ServeHTTP(w, r)
			}
		})
	}
}

func isSafeMethod(m string) bool {
	return m == http.MethodGet || m == http.MethodHead || m == http.MethodOptions
}
