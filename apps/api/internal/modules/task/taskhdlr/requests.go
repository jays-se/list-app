package taskhdlr

import (
	"net/http"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
	"github.com/intellicars/list-app/apps/api/internal/apperr"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/task/taskmdl"
)

// Change requests (E5-S2). Decisions live under /requests/{id} so they
// don't collide with /tasks/{taskId}/… patterns (ADR-0023).
func (h *TaskHdlr) registerRequests(r *apiserver.Router) {
	ws := h.scope.RequireWorkspace
	r.Handle("POST /api/v1/tasks/{taskId}/requests", ws(h.createRequest))
	r.Handle("POST /api/v1/requests/{requestId}/approve", ws(h.approveRequest))
	r.Handle("POST /api/v1/requests/{requestId}/reject", ws(h.rejectRequest))
	r.Handle("POST /api/v1/requests/{requestId}/cancel", ws(h.cancelRequest))
}

func (h *TaskHdlr) createRequest(w http.ResponseWriter, r *http.Request) {
	var req mdl.CreateRequestReq
	if !apiserver.DecodeJSON(w, r, &req) {
		return
	}
	t, v, err := h.svc.CreateRequest(r.Context(), tenant(r), r.PathValue("taskId"), req)
	if apperr.Respond(w, r, h.log, "request_create", err) {
		return
	}
	h.respondTask(w, http.StatusCreated, t, v)
}

func (h *TaskHdlr) approveRequest(w http.ResponseWriter, r *http.Request) {
	t, v, err := h.svc.ApproveRequest(r.Context(), tenant(r), r.PathValue("requestId"))
	if apperr.Respond(w, r, h.log, "request_approve", err) {
		return
	}
	h.respondTask(w, http.StatusOK, t, v)
}

func (h *TaskHdlr) rejectRequest(w http.ResponseWriter, r *http.Request) {
	var req mdl.ReviewRequestReq
	if !apiserver.DecodeJSON(w, r, &req) {
		return
	}
	t, v, err := h.svc.RejectRequest(r.Context(), tenant(r), r.PathValue("requestId"), req)
	if apperr.Respond(w, r, h.log, "request_reject", err) {
		return
	}
	h.respondTask(w, http.StatusOK, t, v)
}

func (h *TaskHdlr) cancelRequest(w http.ResponseWriter, r *http.Request) {
	t, v, err := h.svc.CancelRequest(r.Context(), tenant(r), r.PathValue("requestId"))
	if apperr.Respond(w, r, h.log, "request_cancel", err) {
		return
	}
	h.respondTask(w, http.StatusOK, t, v)
}
