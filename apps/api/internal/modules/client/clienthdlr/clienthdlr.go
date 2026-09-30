// Package clienthdlr exposes clients over HTTP.
package clienthdlr

import (
	"log/slog"
	"net/http"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
	"github.com/intellicars/list-app/apps/api/internal/apperr"
	"github.com/intellicars/list-app/apps/api/internal/db"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/client/clientmdl"
	"github.com/intellicars/list-app/apps/api/internal/modules/client/clientsvc"
	"github.com/intellicars/list-app/apps/api/internal/reqctx"
)

type Scoper interface {
	RequireWorkspace(next http.HandlerFunc) http.HandlerFunc
}

type ClientHdlr struct {
	svc   *clientsvc.ClientSvc
	scope Scoper
	log   *slog.Logger
}

func NewClientHdlr(svc *clientsvc.ClientSvc, scope Scoper, log *slog.Logger) *ClientHdlr {
	return &ClientHdlr{svc: svc, scope: scope, log: log}
}

func (h *ClientHdlr) RegisterRoutes(r *apiserver.Router) {
	ws := h.scope.RequireWorkspace
	r.Handle("GET /api/v1/clients", ws(h.list))
	r.Handle("POST /api/v1/clients", ws(h.create))
	r.Handle("GET /api/v1/clients/{clientId}", ws(h.get))
	r.Handle("PUT /api/v1/clients/{clientId}", ws(h.update))
	r.Handle("DELETE /api/v1/clients/{clientId}", ws(h.delete))
}

func tenant(r *http.Request) (db.Tenant, string) {
	t, _ := reqctx.TenantFrom(r.Context())
	return db.Tenant{WorkspaceID: t.WorkspaceID, UserID: t.UserID}, t.Role
}

func (h *ClientHdlr) list(w http.ResponseWriter, r *http.Request) {
	t, _ := tenant(r)
	cs, err := h.svc.List(r.Context(), t)
	if apperr.Respond(w, r, h.log, "client_list", err) {
		return
	}
	apiserver.RespondOK(w, mdl.ListClientsRsp{Clients: mdl.ToClientRspList(cs)})
}

func (h *ClientHdlr) get(w http.ResponseWriter, r *http.Request) {
	t, _ := tenant(r)
	c, err := h.svc.Get(r.Context(), t, r.PathValue("clientId"))
	if apperr.Respond(w, r, h.log, "client_get", err) {
		return
	}
	apiserver.RespondOK(w, mdl.ClientEnvelopeRsp{Client: mdl.ToClientRsp(c)})
}

func (h *ClientHdlr) create(w http.ResponseWriter, r *http.Request) {
	var in mdl.ClientInput
	if !apiserver.DecodeJSON(w, r, &in) {
		return
	}
	t, _ := tenant(r)
	c, err := h.svc.Create(r.Context(), t, in)
	if apperr.Respond(w, r, h.log, "client_create", err) {
		return
	}
	apiserver.RespondCreated(w, mdl.ClientEnvelopeRsp{Client: mdl.ToClientRsp(c)})
}

func (h *ClientHdlr) update(w http.ResponseWriter, r *http.Request) {
	var in mdl.ClientInput
	if !apiserver.DecodeJSON(w, r, &in) {
		return
	}
	t, _ := tenant(r)
	c, err := h.svc.Update(r.Context(), t, r.PathValue("clientId"), in)
	if apperr.Respond(w, r, h.log, "client_update", err) {
		return
	}
	apiserver.RespondOK(w, mdl.ClientEnvelopeRsp{Client: mdl.ToClientRsp(c)})
}

func (h *ClientHdlr) delete(w http.ResponseWriter, r *http.Request) {
	t, role := tenant(r)
	if apperr.Respond(w, r, h.log, "client_delete", h.svc.Delete(r.Context(), t, role, r.PathValue("clientId"))) {
		return
	}
	apiserver.RespondNoContent(w)
}
