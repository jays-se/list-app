// Package app wires configuration, services and handlers into the root
// HTTP handler. main and the integration tests share it.
package app

import (
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
	"github.com/intellicars/list-app/apps/api/internal/blobstore"
	"github.com/intellicars/list-app/apps/api/internal/config"
	"github.com/intellicars/list-app/apps/api/internal/modules/auth/authhdlr"
	"github.com/intellicars/list-app/apps/api/internal/modules/auth/authsvc"
	"github.com/intellicars/list-app/apps/api/internal/modules/client/clienthdlr"
	"github.com/intellicars/list-app/apps/api/internal/modules/client/clientsvc"
	"github.com/intellicars/list-app/apps/api/internal/modules/label/labelhdlr"
	"github.com/intellicars/list-app/apps/api/internal/modules/label/labelsvc"
	"github.com/intellicars/list-app/apps/api/internal/modules/system/systemhdlr"
	"github.com/intellicars/list-app/apps/api/internal/modules/system/systemsvc"
	"github.com/intellicars/list-app/apps/api/internal/modules/task/taskhdlr"
	"github.com/intellicars/list-app/apps/api/internal/modules/task/tasksvc"
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
	// Blobs overrides the configured store (tests).
	Blobs blobstore.Store
}

// Blobs builds the configured blob store (ADR-0022).
func Blobs(cfg config.Config, now func() time.Time) (blobstore.Store, error) {
	if cfg.BlobDriver == "s3" {
		endpoint, err := url.Parse(cfg.S3Endpoint)
		if err != nil {
			return nil, fmt.Errorf("app: S3_ENDPOINT: %w", err)
		}
		return &blobstore.S3{Endpoint: endpoint, Region: cfg.S3Region, Bucket: cfg.S3Bucket,
			AccessKey: cfg.S3AccessKey, SecretKey: cfg.S3SecretKey, PathStyle: cfg.S3PathStyle, Now: now}, nil
	}
	return blobstore.NewLocal(cfg.BlobDir, cfg.SessionSecret, now)
}

// New builds the root handler and returns the router for contract checks.
func New(cfg config.Config, o Options) (http.Handler, *apiserver.Router, error) {
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

	blobs := o.Blobs
	if blobs == nil {
		var err error
		if blobs, err = Blobs(cfg, o.Now); err != nil {
			return nil, nil, err
		}
	}
	tasks := taskhdlr.NewTaskHdlr(tasksvc.NewTaskSvc(o.Pool, blobs, o.Log), workspaces, o.Log)
	labels := labelhdlr.NewLabelHdlr(labelsvc.NewLabelSvc(o.Pool, o.Log), workspaces, o.Log)
	clients := clienthdlr.NewClientHdlr(clientsvc.NewClientSvc(o.Pool, o.Log), workspaces, o.Log)

	registrars := []apiserver.RouteRegistrar{system, auth, workspaces, tasks, labels, clients}
	if local, ok := blobs.(*blobstore.Local); ok {
		registrars = append(registrars, local) // signed /api/v1/blobs/{token} routes
	}
	csrfExempt := func(r *http.Request) bool { return authhdlr.IsDevAuthorize(r) || blobstore.IsBlobRoute(r) }
	h, router := apiserver.NewHandler(o.Log, registrars, apiserver.CSRF(cfg.PublicOrigin(), csrfExempt))
	return h, router, nil
}
