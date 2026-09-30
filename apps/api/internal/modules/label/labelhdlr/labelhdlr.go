// Package labelhdlr exposes workspace labels over HTTP.
package labelhdlr

import (
	"log/slog"
	"net/http"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
	"github.com/intellicars/list-app/apps/api/internal/apperr"
	"github.com/intellicars/list-app/apps/api/internal/db"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/label/labelmdl"
	"github.com/intellicars/list-app/apps/api/internal/modules/label/labelsvc"
	"github.com/intellicars/list-app/apps/api/internal/reqctx"
)

// Scoper is satisfied by workspacehdlr.WorkspaceHdlr.
type Scoper interface {
	RequireWorkspace(next http.HandlerFunc) http.HandlerFunc
}

type LabelHdlr struct {
	svc   *labelsvc.LabelSvc
	scope Scoper
	log   *slog.Logger
}

func NewLabelHdlr(svc *labelsvc.LabelSvc, scope Scoper, log *slog.Logger) *LabelHdlr {
	return &LabelHdlr{svc: svc, scope: scope, log: log}
}

func (h *LabelHdlr) RegisterRoutes(r *apiserver.Router) {
	r.Handle("GET /api/v1/labels", h.scope.RequireWorkspace(h.list))
	r.Handle("POST /api/v1/labels", h.scope.RequireWorkspace(h.create))
	r.Handle("DELETE /api/v1/labels/{labelId}", h.scope.RequireWorkspace(h.delete))
}

func tenant(r *http.Request) (db.Tenant, string) {
	t, _ := reqctx.TenantFrom(r.Context())
	return db.Tenant{WorkspaceID: t.WorkspaceID, UserID: t.UserID}, t.Role
}

func (h *LabelHdlr) list(w http.ResponseWriter, r *http.Request) {
	t, _ := tenant(r)
	labels, err := h.svc.List(r.Context(), t)
	if apperr.Respond(w, r, h.log, "label_list", err) {
		return
	}
	apiserver.RespondOK(w, mdl.ListLabelsRsp{Labels: mdl.ToLabelRspList(labels)})
}

func (h *LabelHdlr) create(w http.ResponseWriter, r *http.Request) {
	var req mdl.CreateLabelReq
	if !apiserver.DecodeJSON(w, r, &req) {
		return
	}
	t, _ := tenant(r)
	label, err := h.svc.Create(r.Context(), t, req.Name, req.Color)
	if apperr.Respond(w, r, h.log, "label_create", err) {
		return
	}
	apiserver.RespondCreated(w, mdl.LabelEnvelopeRsp{Label: mdl.ToLabelRsp(label)})
}

func (h *LabelHdlr) delete(w http.ResponseWriter, r *http.Request) {
	t, role := tenant(r)
	if apperr.Respond(w, r, h.log, "label_delete", h.svc.Delete(r.Context(), t, role, r.PathValue("labelId"))) {
		return
	}
	apiserver.RespondNoContent(w)
}
