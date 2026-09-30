// Package notificationhdlr exposes the inbox and settings over HTTP (E9).
package notificationhdlr

import (
	"log/slog"
	"net/http"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
	"github.com/intellicars/list-app/apps/api/internal/apperr"
	"github.com/intellicars/list-app/apps/api/internal/db"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/notification/notificationmdl"
	"github.com/intellicars/list-app/apps/api/internal/modules/notification/notificationsvc"
	"github.com/intellicars/list-app/apps/api/internal/reqctx"
)

// Scoper is satisfied by workspacehdlr.WorkspaceHdlr.
type Scoper interface {
	RequireWorkspace(next http.HandlerFunc) http.HandlerFunc
}

type NotificationHdlr struct {
	svc   *notificationsvc.NotificationSvc
	scope Scoper
	log   *slog.Logger
}

func NewNotificationHdlr(svc *notificationsvc.NotificationSvc, scope Scoper, log *slog.Logger) *NotificationHdlr {
	return &NotificationHdlr{svc: svc, scope: scope, log: log}
}

func (h *NotificationHdlr) RegisterRoutes(r *apiserver.Router) {
	ws := h.scope.RequireWorkspace
	r.Handle("GET /api/v1/notifications", ws(h.list))
	r.Handle("POST /api/v1/notifications/{notificationId}/read", ws(h.markRead))
	r.Handle("POST /api/v1/notifications/read-all", ws(h.markAllRead))
	r.Handle("GET /api/v1/notifications/settings", ws(h.settings))
	r.Handle("PUT /api/v1/notifications/settings", ws(h.updateSettings))
}

func tenant(r *http.Request) db.Tenant {
	t, _ := reqctx.TenantFrom(r.Context())
	return db.Tenant{WorkspaceID: t.WorkspaceID, UserID: t.UserID}
}

func (h *NotificationHdlr) list(w http.ResponseWriter, r *http.Request) {
	out, err := h.svc.List(r.Context(), tenant(r), r.URL.Query().Get("unread") == "true")
	if apperr.Respond(w, r, h.log, "notification_list", err) {
		return
	}
	apiserver.RespondOK(w, out)
}

func (h *NotificationHdlr) markRead(w http.ResponseWriter, r *http.Request) {
	if apperr.Respond(w, r, h.log, "notification_read", h.svc.MarkRead(r.Context(), tenant(r), r.PathValue("notificationId"))) {
		return
	}
	apiserver.RespondNoContent(w)
}

func (h *NotificationHdlr) markAllRead(w http.ResponseWriter, r *http.Request) {
	if apperr.Respond(w, r, h.log, "notification_read_all", h.svc.MarkAllRead(r.Context(), tenant(r))) {
		return
	}
	apiserver.RespondNoContent(w)
}

func (h *NotificationHdlr) settings(w http.ResponseWriter, r *http.Request) {
	out, err := h.svc.Settings(r.Context(), tenant(r).UserID)
	if apperr.Respond(w, r, h.log, "notification_settings", err) {
		return
	}
	apiserver.RespondOK(w, out)
}

func (h *NotificationHdlr) updateSettings(w http.ResponseWriter, r *http.Request) {
	var req mdl.SettingsReq
	if !apiserver.DecodeJSON(w, r, &req) {
		return
	}
	out, err := h.svc.UpdateSettings(r.Context(), tenant(r).UserID, req)
	if apperr.Respond(w, r, h.log, "notification_settings_update", err) {
		return
	}
	apiserver.RespondOK(w, out)
}
