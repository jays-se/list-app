// Package systemhdlr exposes the system module over HTTP.
package systemhdlr

import (
	"net/http"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
	"github.com/intellicars/list-app/apps/api/internal/modules/system/systemmdl"
	"github.com/intellicars/list-app/apps/api/internal/modules/system/systemsvc"
)

type SystemHdlr struct {
	svc *systemsvc.SystemSvc
}

func NewSystemHdlr(svc *systemsvc.SystemSvc) *SystemHdlr { return &SystemHdlr{svc: svc} }

// RegisterRoutes implements apiserver.RouteRegistrar. Keep in sync with
// api/openapi.yaml (enforced by the contract test).
func (h *SystemHdlr) RegisterRoutes(r *apiserver.Router) {
	r.Handle("GET /healthz", h.health)
	r.Handle("GET /readyz", h.readiness)
	r.Handle("GET /api/v1/system/info", h.info)
}

func (h *SystemHdlr) health(w http.ResponseWriter, _ *http.Request) {
	apiserver.RespondOK(w, systemmdl.HealthRsp{Status: "ok"})
}

func (h *SystemHdlr) readiness(w http.ResponseWriter, r *http.Request) {
	rsp := h.svc.Readiness(r.Context())
	status := http.StatusOK
	if rsp.Status != systemmdl.ReadinessReady {
		status = http.StatusServiceUnavailable
	}
	apiserver.RespondJSON(w, status, rsp)
}

func (h *SystemHdlr) info(w http.ResponseWriter, _ *http.Request) {
	apiserver.RespondOK(w, h.svc.Info())
}
