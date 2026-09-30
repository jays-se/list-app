// Package telemetryhdlr serves /metrics and takes client error reports
// (E12-S1, ADR-0025).
package telemetryhdlr

import (
	"crypto/subtle"
	"log/slog"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
	"github.com/intellicars/list-app/apps/api/internal/metrics"
	"github.com/intellicars/list-app/apps/api/pkg/logger"
)

type TelemetryHdlr struct {
	reg          *metrics.Registry
	clientErrors *metrics.CounterVec
	token        string
	log          *slog.Logger
}

func NewTelemetryHdlr(reg *metrics.Registry, token string, log *slog.Logger) *TelemetryHdlr {
	return &TelemetryHdlr{
		reg:          reg,
		clientErrors: reg.Counter("client_errors_total", "Errors reported by the web app.", "source"),
		token:        token,
		log:          log,
	}
}

func (h *TelemetryHdlr) RegisterRoutes(r *apiserver.Router) {
	r.Handle("GET /metrics", h.metrics)
	r.Handle("POST /api/v1/client-errors", h.clientError)
}

func (h *TelemetryHdlr) metrics(w http.ResponseWriter, r *http.Request) {
	if h.token != "" {
		got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if subtle.ConstantTimeCompare([]byte(got), []byte(h.token)) != 1 {
			apiserver.RespondProblem(w, r, apiserver.Problem{Type: "unauthenticated", Status: http.StatusUnauthorized, Detail: "Metrics need a token."})
			return
		}
	}
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	h.reg.WriteText(w)
}

// ClientErrorReq is api/openapi.yaml#ClientErrorReport.
type ClientErrorReq struct {
	Source  string `json:"source"`
	Message string `json:"message"`
	Stack   string `json:"stack"`
	URL     string `json:"url"`
	Release string `json:"release"`
}

func clip(s string, n int) string {
	s = strings.ToValidUTF8(s, "?")
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	return string([]rune(s)[:n])
}

func (h *TelemetryHdlr) clientError(w http.ResponseWriter, r *http.Request) {
	var req ClientErrorReq
	if !apiserver.DecodeJSON(w, r, &req) {
		return
	}
	source := req.Source
	if source != "worker" && source != "main" {
		source = "unknown"
	}
	h.clientErrors.Inc(source)
	logger.FromContext(r.Context(), h.log).Warn("client_error",
		"source", source,
		"message", clip(req.Message, 1000),
		"stack", clip(req.Stack, 4000),
		"url", clip(req.URL, 500),
		"release", clip(req.Release, 50),
		"user_agent", clip(r.UserAgent(), 200),
		"at", time.Now().UTC().Format(time.RFC3339),
	)
	apiserver.RespondNoContent(w)
}
