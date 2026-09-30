// Package workspacehdlr exposes tenancy over HTTP and provides the
// RequireWorkspace middleware other modules use for workspace-scoped routes.
package workspacehdlr

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
	"github.com/intellicars/list-app/apps/api/internal/apperr"
	"github.com/intellicars/list-app/apps/api/internal/db"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/workspace/workspacemdl"
	"github.com/intellicars/list-app/apps/api/internal/modules/workspace/workspacesvc"
	"github.com/intellicars/list-app/apps/api/internal/reqctx"
	"github.com/intellicars/list-app/apps/api/pkg/logger"
)

// Authenticator is satisfied by authhdlr.AuthHdlr.
type Authenticator interface {
	RequireUser(next http.HandlerFunc) http.HandlerFunc
}

type WorkspaceHdlr struct {
	svc  *workspacesvc.WorkspaceSvc
	auth Authenticator
	log  *slog.Logger
}

func NewWorkspaceHdlr(svc *workspacesvc.WorkspaceSvc, auth Authenticator, log *slog.Logger) *WorkspaceHdlr {
	return &WorkspaceHdlr{svc: svc, auth: auth, log: log}
}

// RegisterRoutes implements apiserver.RouteRegistrar (see api/openapi.yaml).
func (h *WorkspaceHdlr) RegisterRoutes(r *apiserver.Router) {
	r.Handle("GET /api/v1/workspaces", h.auth.RequireUser(h.list))
	r.Handle("POST /api/v1/workspaces", h.auth.RequireUser(h.create))
	r.Handle("POST /api/v1/workspaces/join", h.auth.RequireUser(h.join))
	r.Handle("POST /api/v1/workspaces/switch", h.auth.RequireUser(h.switchTo))
	r.Handle("GET /api/v1/workspaces/current/members", h.RequireWorkspace(h.members))
	r.Handle("POST /api/v1/workspaces/current/invite-code/rotate", h.RequireWorkspace(h.rotateInvite))
	r.Handle("POST /api/v1/workspaces/current/leave", h.RequireWorkspace(h.leave))
	r.Handle("DELETE /api/v1/workspaces/current/members/{userId}", h.RequireWorkspace(h.removeMember))
	r.Handle("PATCH /api/v1/workspaces/current/members/{userId}", h.RequireWorkspace(h.updateMember))
}

func tenantOf(r *http.Request) (db.Tenant, string) {
	t, _ := reqctx.TenantFrom(r.Context())
	return db.Tenant{WorkspaceID: t.WorkspaceID, UserID: t.UserID}, t.Role
}

func (h *WorkspaceHdlr) leave(w http.ResponseWriter, r *http.Request) {
	t, _ := tenantOf(r)
	if h.handleErr(w, r, "leave", h.svc.Leave(r.Context(), t)) {
		return
	}
	apiserver.RespondNoContent(w)
}

func (h *WorkspaceHdlr) removeMember(w http.ResponseWriter, r *http.Request) {
	t, role := tenantOf(r)
	if h.handleErr(w, r, "remove_member", h.svc.RemoveMember(r.Context(), t, role, r.PathValue("userId"))) {
		return
	}
	apiserver.RespondNoContent(w)
}

func (h *WorkspaceHdlr) updateMember(w http.ResponseWriter, r *http.Request) {
	var req mdl.UpdateMemberReq
	if !apiserver.DecodeJSON(w, r, &req) {
		return
	}
	t, role := tenantOf(r)
	m, err := h.svc.SetRole(r.Context(), t, role, r.PathValue("userId"), req.Role)
	if h.handleErr(w, r, "update_member", err) {
		return
	}
	apiserver.RespondOK(w, mdl.MemberEnvelopeRsp{Member: mdl.ToMemberRsp(m)})
}

// RequireWorkspace = RequireUser + a verified membership in the session's
// active workspace. It puts reqctx.Tenant into the context; without an
// active workspace it answers 409 no_active_workspace.
func (h *WorkspaceHdlr) RequireWorkspace(next http.HandlerFunc) http.HandlerFunc {
	return h.auth.RequireUser(func(w http.ResponseWriter, r *http.Request) {
		user, _ := reqctx.UserFrom(r.Context())
		sess, _ := reqctx.SessionFrom(r.Context())
		if sess.ActiveWorkspaceID == nil {
			apiserver.RespondConflict(w, r, "no_active_workspace", "Create or join a workspace first.")
			return
		}
		role, err := h.svc.Membership(r.Context(), *sess.ActiveWorkspaceID, user.ID)
		if errors.Is(err, workspacesvc.ErrNotMember) {
			apiserver.RespondConflict(w, r, "no_active_workspace", "You are no longer a member of this workspace.")
			return
		}
		if err != nil {
			h.internal(w, r, "membership", err)
			return
		}
		ctx := reqctx.WithTenant(r.Context(), reqctx.Tenant{WorkspaceID: *sess.ActiveWorkspaceID, UserID: user.ID, Role: role})
		next(w, r.WithContext(ctx))
	})
}

func (h *WorkspaceHdlr) list(w http.ResponseWriter, r *http.Request) {
	user, _ := reqctx.UserFrom(r.Context())
	sess, _ := reqctx.SessionFrom(r.Context())
	list, active, err := h.svc.List(r.Context(), user.ID, sess.ActiveWorkspaceID)
	if err != nil {
		h.internal(w, r, "list", err)
		return
	}
	rsp := mdl.ListWorkspacesRsp{Workspaces: mdl.ToWorkspaceRspList(list)}
	if active != nil {
		rsp.Active = mdl.ToActiveWorkspaceRsp(*active)
	}
	apiserver.RespondOK(w, rsp)
}

func (h *WorkspaceHdlr) create(w http.ResponseWriter, r *http.Request) {
	var req mdl.CreateWorkspaceReq
	if !apiserver.DecodeJSON(w, r, &req) {
		return
	}
	user, _ := reqctx.UserFrom(r.Context())
	sess, _ := reqctx.SessionFrom(r.Context())
	ws, err := h.svc.Create(r.Context(), user.ID, sess.IDHash, req.Name)
	if h.handleErr(w, r, "create", err) {
		return
	}
	apiserver.RespondCreated(w, mdl.WorkspaceEnvelopeRsp{Workspace: mdl.ToWorkspaceRsp(ws)})
}

func (h *WorkspaceHdlr) join(w http.ResponseWriter, r *http.Request) {
	var req mdl.JoinWorkspaceReq
	if !apiserver.DecodeJSON(w, r, &req) {
		return
	}
	user, _ := reqctx.UserFrom(r.Context())
	sess, _ := reqctx.SessionFrom(r.Context())
	ws, err := h.svc.Join(r.Context(), user.ID, sess.IDHash, req.InviteCode)
	if h.handleErr(w, r, "join", err) {
		return
	}
	apiserver.RespondOK(w, mdl.WorkspaceEnvelopeRsp{Workspace: mdl.ToWorkspaceRsp(ws)})
}

func (h *WorkspaceHdlr) switchTo(w http.ResponseWriter, r *http.Request) {
	var req mdl.SwitchWorkspaceReq
	if !apiserver.DecodeJSON(w, r, &req) {
		return
	}
	user, _ := reqctx.UserFrom(r.Context())
	sess, _ := reqctx.SessionFrom(r.Context())
	ws, err := h.svc.Switch(r.Context(), user.ID, sess.IDHash, req.WorkspaceID)
	if h.handleErr(w, r, "switch", err) {
		return
	}
	apiserver.RespondOK(w, mdl.WorkspaceEnvelopeRsp{Workspace: mdl.ToWorkspaceRsp(ws)})
}

func (h *WorkspaceHdlr) members(w http.ResponseWriter, r *http.Request) {
	t, _ := reqctx.TenantFrom(r.Context())
	members, err := h.svc.Members(r.Context(), db.Tenant{WorkspaceID: t.WorkspaceID, UserID: t.UserID})
	if err != nil {
		h.internal(w, r, "members", err)
		return
	}
	apiserver.RespondOK(w, mdl.ListMembersRsp{Members: mdl.ToMemberRspList(members)})
}

func (h *WorkspaceHdlr) rotateInvite(w http.ResponseWriter, r *http.Request) {
	t, _ := reqctx.TenantFrom(r.Context())
	code, err := h.svc.RotateInviteCode(r.Context(), db.Tenant{WorkspaceID: t.WorkspaceID, UserID: t.UserID}, t.Role)
	if h.handleErr(w, r, "rotate_invite", err) {
		return
	}
	apiserver.RespondOK(w, mdl.InviteCodeRsp{InviteCode: code})
}

// handleErr maps service errors to problems; it returns true if it responded.
func (h *WorkspaceHdlr) handleErr(w http.ResponseWriter, r *http.Request, op string, err error) bool {
	return apperr.Respond(w, r, h.log, "workspace_"+op, err)
}

func (h *WorkspaceHdlr) internal(w http.ResponseWriter, r *http.Request, op string, err error) {
	logger.FromContext(r.Context(), h.log).Error("workspace_"+op+"_failed", "error", err)
	apiserver.RespondInternalError(w, r)
}
