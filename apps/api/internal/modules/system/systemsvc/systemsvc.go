// Package systemsvc answers liveness, readiness and identity questions.
//
// It holds no mutable state, so the ops/query channel pattern from the
// backend-go rule (§2) does not apply here; stateful, cached modules use it.
package systemsvc

import (
	"context"
	"time"

	"github.com/intellicars/list-app/apps/api/internal/modules/system/systemmdl"
)

// Pinger is satisfied by *pgxpool.Pool; nil means no database is configured.
type Pinger interface {
	Ping(ctx context.Context) error
}

type SystemSvc struct {
	service   string
	version   string
	startedAt time.Time
	db        Pinger
}

func NewSystemSvc(service, version string, startedAt time.Time, db Pinger) *SystemSvc {
	return &SystemSvc{service: service, version: version, startedAt: startedAt.UTC(), db: db}
}

func (s *SystemSvc) Info() systemmdl.SystemInfoRsp {
	return systemmdl.SystemInfoRsp{Service: s.service, Version: s.version, StartedAt: s.startedAt}
}

// Readiness checks every dependency with a short deadline.
func (s *SystemSvc) Readiness(ctx context.Context) systemmdl.ReadinessRsp {
	checks := map[string]string{}
	ready := true

	if s.db == nil {
		checks["database"] = systemmdl.CheckNotConfigure
		ready = false
	} else {
		pingCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		defer cancel()
		if err := s.db.Ping(pingCtx); err != nil {
			checks["database"] = "unreachable"
			ready = false
		} else {
			checks["database"] = systemmdl.CheckOK
		}
	}

	status := systemmdl.ReadinessReady
	if !ready {
		status = systemmdl.ReadinessNotReady
	}
	return systemmdl.ReadinessRsp{Status: status, Checks: checks}
}
