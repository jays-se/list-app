// Package authhdlr exposes sign-in, session and sign-out over HTTP.
package authhdlr

import (
	"errors"
	"html/template"
	"log/slog"
	"net/http"
	"net/url"
	"time"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
	"github.com/intellicars/list-app/apps/api/internal/modules/auth/authmdl"
	"github.com/intellicars/list-app/apps/api/internal/modules/auth/authsvc"
	"github.com/intellicars/list-app/apps/api/internal/reqctx"
	"github.com/intellicars/list-app/apps/api/pkg/logger"
)

const (
	SessionCookie = "sid"
	FlowCookie    = "oauth_flow"
	flowPath      = "/api/v1/auth"
	callbackPath  = "/api/v1/auth/google/callback"
)

type AuthHdlr struct {
	svc    *authsvc.AuthSvc
	dev    *authsvc.DevProvider // nil unless AUTH_PROVIDER=dev
	secure bool
	log    *slog.Logger
}

func NewAuthHdlr(svc *authsvc.AuthSvc, dev *authsvc.DevProvider, secureCookies bool, log *slog.Logger) *AuthHdlr {
	return &AuthHdlr{svc: svc, dev: dev, secure: secureCookies, log: log}
}

// RegisterRoutes implements apiserver.RouteRegistrar (see api/openapi.yaml).
func (h *AuthHdlr) RegisterRoutes(r *apiserver.Router) {
	r.Handle("GET /api/v1/auth/google/login", h.login)
	r.Handle("GET "+callbackPath, h.callback)
	r.Handle("GET /api/v1/auth/me", h.RequireUser(h.me))
	r.Handle("POST /api/v1/auth/logout", h.logout)
	if h.dev != nil {
		r.Handle("GET "+authsvc.DevAuthorizePath, h.devForm)
		r.Handle("POST "+authsvc.DevAuthorizePath, h.devSubmit)
	}
}

// IsDevAuthorize lets the CSRF middleware exempt the dev provider's form post.
func IsDevAuthorize(r *http.Request) bool {
	return r.Method == http.MethodPost && r.URL.Path == authsvc.DevAuthorizePath
}

// RequireUser rejects requests without a valid session (401 problem) and
// puts the user and session into the request context.
func (h *AuthHdlr) RequireUser(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(SessionCookie)
		if err != nil {
			apiserver.RespondUnauthorized(w, r)
			return
		}
		sess, user, err := h.svc.Authenticate(r.Context(), cookie.Value)
		if errors.Is(err, authsvc.ErrNoSession) {
			h.clearCookie(w, SessionCookie, "/")
			apiserver.RespondUnauthorized(w, r)
			return
		}
		if err != nil {
			logger.FromContext(r.Context(), h.log).Error("authenticate_failed", "error", err)
			apiserver.RespondInternalError(w, r)
			return
		}
		ctx := reqctx.WithAuth(r.Context(),
			reqctx.User{ID: user.ID, Name: user.Name, Email: user.Email, Image: user.ImageURL},
			reqctx.Session{IDHash: sess.IDHash, ActiveWorkspaceID: sess.ActiveWorkspaceID})
		next(w, r.WithContext(ctx))
	}
}

func (h *AuthHdlr) login(w http.ResponseWriter, r *http.Request) {
	target, flow, err := h.svc.BeginLogin(r.URL.Query().Get("returnTo"))
	if err != nil {
		logger.FromContext(r.Context(), h.log).Error("login_start_failed", "error", err)
		http.Redirect(w, r, "/login?error="+authsvc.FailOAuth, http.StatusFound)
		return
	}
	h.setCookie(w, FlowCookie, flow, flowPath, 10*time.Minute)
	http.Redirect(w, r, target, http.StatusFound)
}

func (h *AuthHdlr) callback(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	flow := ""
	if c, err := r.Cookie(FlowCookie); err == nil {
		flow = c.Value
	}
	h.clearCookie(w, FlowCookie, flowPath)
	result, fail := h.svc.CompleteLogin(r.Context(),
		authsvc.CallbackParams{Code: q.Get("code"), State: q.Get("state"), Error: q.Get("error")}, flow)
	if fail != "" {
		http.Redirect(w, r, "/login?error="+fail, http.StatusFound)
		return
	}
	h.setCookie(w, SessionCookie, result.Token, "/", h.svc.SessionTTL())
	http.Redirect(w, r, result.ReturnTo, http.StatusFound)
}

func (h *AuthHdlr) me(w http.ResponseWriter, r *http.Request) {
	u, _ := reqctx.UserFrom(r.Context())
	apiserver.RespondOK(w, authmdl.MeRsp{User: authmdl.UserRsp{ID: u.ID, Name: u.Name, Email: u.Email, Image: u.Image}})
}

func (h *AuthHdlr) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(SessionCookie); err == nil {
		if err := h.svc.Logout(r.Context(), c.Value); err != nil {
			logger.FromContext(r.Context(), h.log).Error("logout_failed", "error", err)
			apiserver.RespondInternalError(w, r)
			return
		}
	}
	h.clearCookie(w, SessionCookie, "/")
	apiserver.RespondNoContent(w)
}

// --- Dev identity provider (ADR-0017; registered only when AUTH_PROVIDER=dev) ---

var devPage = template.Must(template.New("dev").Parse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dev sign-in</title>
<style>body{font-family:system-ui,sans-serif;max-width:360px;margin:64px auto;padding:0 16px;color:#222}
label{display:block;margin:12px 0 4px;font-weight:600}input{width:100%;padding:8px;box-sizing:border-box}
button{margin-top:16px;padding:8px 16px}p{color:#555}</style></head>
<body><h1>Dev sign-in</h1>
<p>Local identity provider. Not available in production.</p>
<form method="post" action="{{.Action}}">
<input type="hidden" name="state" value="{{.State}}"><input type="hidden" name="nonce" value="{{.Nonce}}">
<label for="name">Name</label><input id="name" name="name" value="{{.Name}}" required>
<label for="email">Email</label><input id="email" name="email" type="email" value="{{.Email}}" required>
{{if .Error}}<p role="alert">{{.Error}}</p>{{end}}
<button type="submit">Sign in</button> <button type="submit" name="deny" value="1" formnovalidate>Cancel</button>
</form></body></html>`))

type devPageData struct{ Action, State, Nonce, Name, Email, Error string }

func (h *AuthHdlr) devForm(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	h.renderDev(w, http.StatusOK, devPageData{State: q.Get("state"), Nonce: q.Get("nonce")})
}

func (h *AuthHdlr) devSubmit(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		apiserver.RespondBadRequest(w, r, "invalid_body", "Invalid form.")
		return
	}
	state, nonce := r.PostForm.Get("state"), r.PostForm.Get("nonce")
	if r.PostForm.Get("deny") != "" {
		http.Redirect(w, r, callbackPath+"?"+url.Values{"state": {state}, "error": {"access_denied"}}.Encode(), http.StatusFound)
		return
	}
	code, err := h.dev.IssueCode(r.PostForm.Get("name"), r.PostForm.Get("email"), nonce)
	if err != nil {
		h.renderDev(w, http.StatusUnprocessableEntity, devPageData{
			State: state, Nonce: nonce, Name: r.PostForm.Get("name"), Email: r.PostForm.Get("email"),
			Error: "Enter a name and a valid email.",
		})
		return
	}
	http.Redirect(w, r, callbackPath+"?"+url.Values{"state": {state}, "code": {code}}.Encode(), http.StatusFound)
}

func (h *AuthHdlr) renderDev(w http.ResponseWriter, status int, data devPageData) {
	data.Action = authsvc.DevAuthorizePath
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	_ = devPage.Execute(w, data)
}

// --- cookies ---

func (h *AuthHdlr) setCookie(w http.ResponseWriter, name, value, path string, ttl time.Duration) {
	http.SetCookie(w, &http.Cookie{
		Name: name, Value: value, Path: path, MaxAge: int(ttl.Seconds()),
		HttpOnly: true, Secure: h.secure, SameSite: http.SameSiteLaxMode,
	})
}

func (h *AuthHdlr) clearCookie(w http.ResponseWriter, name, path string) {
	http.SetCookie(w, &http.Cookie{
		Name: name, Value: "", Path: path, MaxAge: -1,
		HttpOnly: true, Secure: h.secure, SameSite: http.SameSiteLaxMode,
	})
}
