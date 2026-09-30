// Package app wires configuration, services and handlers into the root
// HTTP handler. main and the integration tests share it.
package app

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
	"github.com/intellicars/list-app/apps/api/internal/config"
	"github.com/intellicars/list-app/apps/api/internal/modules/auth/authhdlr"
	"github.com/intellicars/list-app/apps/api/internal/modules/auth/authsvc"
	"github.com/intellicars/list-app/apps/api/internal/modules/system/systemhdlr"
	"github.com/intellicars/list-app/apps/api/internal/modules/system/systemsvc"
	"github.com/intellicars/list-app/apps/api/internal/modules/workspace/workspacehdlr"
	"github.com/intellicars/list-app/apps/api/internal/modules/workspace/workspacesvc"
)

const ServiceName = "list-api"

// Options are the runtime dependencies New needs beyond config.
type Options struct {
	Pool      *pgxpool.Pool // nil: system routes work, the rest answer 500
	Log       *slog.Logger
	Now       func() time.Time
	StartedAt time.Time
}

// New builds the root handler and returns the router for contract checks.
func New(cfg config.Config, o Options) (http.Handler, *apiserver.Router) {
	if o.Now == nil {
		o.Now = time.Now
	}

	var pinger systemsvc.Pinger // stays a nil interface without a pool
	if o.Pool != nil {
		pinger = o.Pool
	}
	system := systemhdlr.NewSystemHdlr(systemsvc.NewSystemSvc(ServiceName, cfg.Version, o.StartedAt, pinger))

	var provider authsvc.IdentityProvider
	var dev *authsvc.DevProvider
	if cfg.AuthProvider == config.AuthProviderDev {
		dev = authsvc.NewDevProvider(cfg.SessionSecret, o.Now)
		provider = dev
	} else {
		provider = authsvc.NewGoogleProvider(cfg.GoogleIssuer, cfg.GoogleClientID, cfg.GoogleClientSecret,
			cfg.PublicBaseURL+"/api/v1/auth/google/callback")
	}
	authSvc := authsvc.NewAuthSvc(o.Pool, provider, cfg.SessionSecret, cfg.SessionTTL, o.Now, o.Log)
	auth := authhdlr.NewAuthHdlr(authSvc, dev, cfg.CookieSecure, o.Log)

	workspaces := workspacehdlr.NewWorkspaceHdlr(workspacesvc.NewWorkspaceSvc(o.Pool, authSvc, o.Log), auth, o.Log)

	return apiserver.NewHandler(o.Log,
		[]apiserver.RouteRegistrar{system, auth, workspaces},
		apiserver.CSRF(cfg.PublicOrigin(), authhdlr.IsDevAuthorize),
	)
}
