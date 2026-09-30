// Package dochdlr exposes docs over HTTP (api/openapi.yaml#docs).
package dochdlr

import (
	"log/slog"
	"net/http"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
	"github.com/intellicars/list-app/apps/api/internal/apperr"
	"github.com/intellicars/list-app/apps/api/internal/db"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/doc/docmdl"
	"github.com/intellicars/list-app/apps/api/internal/modules/doc/docsvc"
	taskmdl "github.com/intellicars/list-app/apps/api/internal/modules/task/taskmdl"
	"github.com/intellicars/list-app/apps/api/internal/reqctx"
)

// Scoper is satisfied by workspacehdlr.WorkspaceHdlr.
type Scoper interface {
	RequireWorkspace(next http.HandlerFunc) http.HandlerFunc
}

type DocHdlr struct {
	svc   *docsvc.DocSvc
	scope Scoper
	log   *slog.Logger
}

func NewDocHdlr(svc *docsvc.DocSvc, scope Scoper, log *slog.Logger) *DocHdlr {
	return &DocHdlr{svc: svc, scope: scope, log: log}
}

func (h *DocHdlr) RegisterRoutes(r *apiserver.Router) {
	ws := h.scope.RequireWorkspace
	r.Handle("GET /api/v1/docs", ws(h.list))
	r.Handle("POST /api/v1/docs", ws(h.create))
	r.Handle("GET /api/v1/docs/{docId}", ws(h.get))
	r.Handle("PATCH /api/v1/docs/{docId}", ws(h.update))
	r.Handle("DELETE /api/v1/docs/{docId}", ws(h.delete))
	r.Handle("POST /api/v1/docs/{docId}/files", ws(h.startUpload))
	r.Handle("POST /api/v1/doc-files/{fileId}/complete", ws(h.completeUpload))
	r.Handle("GET /api/v1/doc-files/{fileId}", ws(h.download))
	r.Handle("DELETE /api/v1/doc-files/{fileId}", ws(h.deleteFile))
}

func caller(r *http.Request) docsvc.Caller {
	t, _ := reqctx.TenantFrom(r.Context())
	return docsvc.Caller{Tenant: db.Tenant{WorkspaceID: t.WorkspaceID, UserID: t.UserID}, Role: t.Role}
}

func (h *DocHdlr) respond(w http.ResponseWriter, status int, d mdl.Doc, v mdl.DocViewer) {
	w.Header().Set("ETag", docsvc.ETag(d.Version))
	apiserver.RespondJSON(w, status, mdl.DocEnvelopeRsp{Doc: mdl.ToDocRsp(d, v)})
}

func (h *DocHdlr) list(w http.ResponseWriter, r *http.Request) {
	docs, err := h.svc.List(r.Context(), caller(r), r.URL.Query().Get("clientId"))
	if apperr.Respond(w, r, h.log, "doc_list", err) {
		return
	}
	out := mdl.ListDocsRsp{Docs: make([]mdl.DocSummaryRsp, 0, len(docs))}
	for _, d := range docs {
		out.Docs = append(out.Docs, mdl.ToDocSummaryRsp(d))
	}
	apiserver.RespondOK(w, out)
}

func (h *DocHdlr) get(w http.ResponseWriter, r *http.Request) {
	d, v, err := h.svc.Get(r.Context(), caller(r), r.PathValue("docId"))
	if apperr.Respond(w, r, h.log, "doc_get", err) {
		return
	}
	h.respond(w, http.StatusOK, d, v)
}

func (h *DocHdlr) create(w http.ResponseWriter, r *http.Request) {
	var req mdl.CreateDocReq
	if !apiserver.DecodeJSON(w, r, &req) {
		return
	}
	d, v, err := h.svc.Create(r.Context(), caller(r), req)
	if apperr.Respond(w, r, h.log, "doc_create", err) {
		return
	}
	h.respond(w, http.StatusCreated, d, v)
}

func (h *DocHdlr) update(w http.ResponseWriter, r *http.Request) {
	var req mdl.UpdateDocReq
	if !apiserver.DecodeJSON(w, r, &req) {
		return
	}
	d, v, err := h.svc.Update(r.Context(), caller(r), r.PathValue("docId"), r.Header.Get("If-Match"), req)
	if apperr.Respond(w, r, h.log, "doc_update", err) {
		return
	}
	h.respond(w, http.StatusOK, d, v)
}

func (h *DocHdlr) delete(w http.ResponseWriter, r *http.Request) {
	if apperr.Respond(w, r, h.log, "doc_delete", h.svc.Delete(r.Context(), caller(r), r.PathValue("docId"))) {
		return
	}
	apiserver.RespondNoContent(w)
}

func (h *DocHdlr) startUpload(w http.ResponseWriter, r *http.Request) {
	var req taskmdl.CreateAttachmentReq
	if !apiserver.DecodeJSON(w, r, &req) {
		return
	}
	att, target, err := h.svc.StartUpload(r.Context(), caller(r), r.PathValue("docId"), req)
	if apperr.Respond(w, r, h.log, "doc_file_start", err) {
		return
	}
	apiserver.RespondCreated(w, taskmdl.AttachmentUploadRsp{
		Attachment: att,
		Upload:     taskmdl.UploadTargetRsp{Method: target.Method, URL: target.URL, Headers: target.Headers},
	})
}

func (h *DocHdlr) completeUpload(w http.ResponseWriter, r *http.Request) {
	att, err := h.svc.CompleteUpload(r.Context(), caller(r), r.PathValue("fileId"))
	if apperr.Respond(w, r, h.log, "doc_file_complete", err) {
		return
	}
	apiserver.RespondOK(w, taskmdl.AttachmentEnvelopeRsp{Attachment: att})
}

func (h *DocHdlr) download(w http.ResponseWriter, r *http.Request) {
	url, err := h.svc.DownloadURL(r.Context(), caller(r), r.PathValue("fileId"))
	if apperr.Respond(w, r, h.log, "doc_file_download", err) {
		return
	}
	http.Redirect(w, r, url, http.StatusFound)
}

func (h *DocHdlr) deleteFile(w http.ResponseWriter, r *http.Request) {
	if apperr.Respond(w, r, h.log, "doc_file_delete", h.svc.DeleteFile(r.Context(), caller(r), r.PathValue("fileId"))) {
		return
	}
	apiserver.RespondNoContent(w)
}
