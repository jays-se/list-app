// Package taskhdlr exposes tasks over HTTP (see api/openapi.yaml#tasks).
package taskhdlr

import (
	"log/slog"
	"net/http"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
	"github.com/intellicars/list-app/apps/api/internal/apperr"
	"github.com/intellicars/list-app/apps/api/internal/db"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/task/taskmdl"
	"github.com/intellicars/list-app/apps/api/internal/modules/task/tasksvc"
	"github.com/intellicars/list-app/apps/api/internal/reqctx"
)

// Scoper is satisfied by workspacehdlr.WorkspaceHdlr.
type Scoper interface {
	RequireWorkspace(next http.HandlerFunc) http.HandlerFunc
}

type TaskHdlr struct {
	svc   *tasksvc.TaskSvc
	scope Scoper
	log   *slog.Logger
}

func NewTaskHdlr(svc *tasksvc.TaskSvc, scope Scoper, log *slog.Logger) *TaskHdlr {
	return &TaskHdlr{svc: svc, scope: scope, log: log}
}

func (h *TaskHdlr) RegisterRoutes(r *apiserver.Router) {
	ws := h.scope.RequireWorkspace
	r.Handle("GET /api/v1/tasks", ws(h.list))
	r.Handle("POST /api/v1/tasks", ws(h.create))
	r.Handle("GET /api/v1/tasks/{taskId}", ws(h.get))
	r.Handle("PATCH /api/v1/tasks/{taskId}", ws(h.update))
	r.Handle("DELETE /api/v1/tasks/{taskId}", ws(h.delete))
	r.Handle("PUT /api/v1/tasks/{taskId}/assignees", ws(h.replaceUsers(tasksvc.SetAssignees)))
	r.Handle("PUT /api/v1/tasks/{taskId}/owners", ws(h.replaceUsers(tasksvc.SetOwners)))
	r.Handle("PUT /api/v1/tasks/{taskId}/labels", ws(h.replaceLabels))
	h.registerCollab(r)
	h.registerRequests(r)
}

func tenant(r *http.Request) tasksvc.Caller {
	t, _ := reqctx.TenantFrom(r.Context())
	return tasksvc.Caller{Tenant: db.Tenant{WorkspaceID: t.WorkspaceID, UserID: t.UserID}, Role: t.Role}
}

func (h *TaskHdlr) list(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	tn := tenant(r)
	f := mdl.Filter{
		Status: q.Get("status"), AssigneeID: q.Get("assigneeId"), LabelID: q.Get("labelId"),
		ClientID: q.Get("clientId"), ParentID: q.Get("parentId"),
	}
	if q.Get("mine") == "true" {
		f.AssigneeID = tn.UserID
	}
	tasks, err := h.svc.List(r.Context(), tn, f)
	if apperr.Respond(w, r, h.log, "task_list", err) {
		return
	}
	apiserver.RespondOK(w, mdl.ListTasksRsp{Tasks: mdl.ToTaskSummaryRspList(tasks)})
}

func (h *TaskHdlr) respondTask(w http.ResponseWriter, status int, t mdl.Task, v mdl.Viewer) {
	w.Header().Set("ETag", tasksvc.ETag(t.Version))
	apiserver.RespondJSON(w, status, mdl.TaskEnvelopeRsp{Task: mdl.ToTaskRsp(t, v)})
}

func (h *TaskHdlr) get(w http.ResponseWriter, r *http.Request) {
	t, v, err := h.svc.Get(r.Context(), tenant(r), r.PathValue("taskId"))
	if apperr.Respond(w, r, h.log, "task_get", err) {
		return
	}
	h.respondTask(w, http.StatusOK, t, v)
}

func (h *TaskHdlr) create(w http.ResponseWriter, r *http.Request) {
	var req mdl.CreateTaskReq
	if !apiserver.DecodeJSON(w, r, &req) {
		return
	}
	t, v, err := h.svc.Create(r.Context(), tenant(r), req)
	if apperr.Respond(w, r, h.log, "task_create", err) {
		return
	}
	h.respondTask(w, http.StatusCreated, t, v)
}

func (h *TaskHdlr) update(w http.ResponseWriter, r *http.Request) {
	var req mdl.UpdateTaskReq
	if !apiserver.DecodeJSON(w, r, &req) {
		return
	}
	t, v, err := h.svc.Update(r.Context(), tenant(r), r.PathValue("taskId"), r.Header.Get("If-Match"), req)
	if apperr.Respond(w, r, h.log, "task_update", err) {
		return
	}
	h.respondTask(w, http.StatusOK, t, v)
}

func (h *TaskHdlr) delete(w http.ResponseWriter, r *http.Request) {
	if apperr.Respond(w, r, h.log, "task_delete", h.svc.Delete(r.Context(), tenant(r), r.PathValue("taskId"))) {
		return
	}
	apiserver.RespondNoContent(w)
}

func (h *TaskHdlr) replaceUsers(kind tasksvc.Set) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req mdl.UserIDsReq
		if !apiserver.DecodeJSON(w, r, &req) {
			return
		}
		t, v, err := h.svc.ReplaceSet(r.Context(), tenant(r), r.PathValue("taskId"), kind, req.UserIDs)
		if apperr.Respond(w, r, h.log, "task_set_people", err) {
			return
		}
		h.respondTask(w, http.StatusOK, t, v)
	}
}

func (h *TaskHdlr) replaceLabels(w http.ResponseWriter, r *http.Request) {
	var req mdl.LabelIDsReq
	if !apiserver.DecodeJSON(w, r, &req) {
		return
	}
	t, v, err := h.svc.ReplaceSet(r.Context(), tenant(r), r.PathValue("taskId"), tasksvc.SetLabels, req.LabelIDs)
	if apperr.Respond(w, r, h.log, "task_set_labels", err) {
		return
	}
	h.respondTask(w, http.StatusOK, t, v)
}
