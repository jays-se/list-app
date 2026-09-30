package taskhdlr

import (
	"net/http"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
	"github.com/intellicars/list-app/apps/api/internal/apperr"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/task/taskmdl"
)

func (h *TaskHdlr) registerCollab(r *apiserver.Router) {
	ws := h.scope.RequireWorkspace
	r.Handle("POST /api/v1/tasks/{taskId}/checklist", ws(h.addChecklistItem))
	r.Handle("PATCH /api/v1/tasks/checklist/{itemId}", ws(h.updateChecklistItem))
	r.Handle("DELETE /api/v1/tasks/checklist/{itemId}", ws(h.deleteChecklistItem))
	r.Handle("POST /api/v1/tasks/{taskId}/comments", ws(h.addComment))
	r.Handle("POST /api/v1/tasks/{taskId}/attachments", ws(h.startUpload))
	r.Handle("POST /api/v1/attachments/{attachmentId}/complete", ws(h.completeUpload))
	r.Handle("GET /api/v1/attachments/{attachmentId}", ws(h.download))
	r.Handle("DELETE /api/v1/attachments/{attachmentId}", ws(h.deleteAttachment))
	r.Handle("GET /api/v1/tasks/{taskId}/history", ws(h.history))
}

func (h *TaskHdlr) addChecklistItem(w http.ResponseWriter, r *http.Request) {
	var req mdl.CreateChecklistItemReq
	if !apiserver.DecodeJSON(w, r, &req) {
		return
	}
	item, err := h.svc.AddChecklistItem(r.Context(), tenant(r), r.PathValue("taskId"), req)
	if apperr.Respond(w, r, h.log, "checklist_add", err) {
		return
	}
	apiserver.RespondCreated(w, mdl.ChecklistItemEnvelopeRsp{Item: item})
}

func (h *TaskHdlr) updateChecklistItem(w http.ResponseWriter, r *http.Request) {
	var req mdl.UpdateChecklistItemReq
	if !apiserver.DecodeJSON(w, r, &req) {
		return
	}
	item, err := h.svc.UpdateChecklistItem(r.Context(), tenant(r), r.PathValue("itemId"), req)
	if apperr.Respond(w, r, h.log, "checklist_update", err) {
		return
	}
	apiserver.RespondOK(w, mdl.ChecklistItemEnvelopeRsp{Item: item})
}

func (h *TaskHdlr) deleteChecklistItem(w http.ResponseWriter, r *http.Request) {
	if apperr.Respond(w, r, h.log, "checklist_delete", h.svc.DeleteChecklistItem(r.Context(), tenant(r), r.PathValue("itemId"))) {
		return
	}
	apiserver.RespondNoContent(w)
}

func (h *TaskHdlr) addComment(w http.ResponseWriter, r *http.Request) {
	var req mdl.CreateCommentReq
	if !apiserver.DecodeJSON(w, r, &req) {
		return
	}
	c, err := h.svc.AddComment(r.Context(), tenant(r), r.PathValue("taskId"), req)
	if apperr.Respond(w, r, h.log, "comment_add", err) {
		return
	}
	apiserver.RespondCreated(w, mdl.CommentEnvelopeRsp{Comment: c})
}

func (h *TaskHdlr) startUpload(w http.ResponseWriter, r *http.Request) {
	var req mdl.CreateAttachmentReq
	if !apiserver.DecodeJSON(w, r, &req) {
		return
	}
	att, target, err := h.svc.StartUpload(r.Context(), tenant(r), r.PathValue("taskId"), req)
	if apperr.Respond(w, r, h.log, "attachment_start", err) {
		return
	}
	apiserver.RespondCreated(w, mdl.AttachmentUploadRsp{
		Attachment: att,
		Upload:     mdl.UploadTargetRsp{Method: target.Method, URL: target.URL, Headers: target.Headers},
	})
}

func (h *TaskHdlr) completeUpload(w http.ResponseWriter, r *http.Request) {
	att, err := h.svc.CompleteUpload(r.Context(), tenant(r), r.PathValue("attachmentId"))
	if apperr.Respond(w, r, h.log, "attachment_complete", err) {
		return
	}
	apiserver.RespondOK(w, mdl.AttachmentEnvelopeRsp{Attachment: att})
}

func (h *TaskHdlr) download(w http.ResponseWriter, r *http.Request) {
	url, err := h.svc.DownloadURL(r.Context(), tenant(r), r.PathValue("attachmentId"))
	if apperr.Respond(w, r, h.log, "attachment_download", err) {
		return
	}
	http.Redirect(w, r, url, http.StatusFound)
}

func (h *TaskHdlr) deleteAttachment(w http.ResponseWriter, r *http.Request) {
	if apperr.Respond(w, r, h.log, "attachment_delete", h.svc.DeleteAttachment(r.Context(), tenant(r), r.PathValue("attachmentId"))) {
		return
	}
	apiserver.RespondNoContent(w)
}

func (h *TaskHdlr) history(w http.ResponseWriter, r *http.Request) {
	hist, err := h.svc.History(r.Context(), tenant(r), r.PathValue("taskId"))
	if apperr.Respond(w, r, h.log, "task_history", err) {
		return
	}
	apiserver.RespondOK(w, hist)
}
