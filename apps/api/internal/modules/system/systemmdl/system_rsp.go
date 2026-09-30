// Package systemmdl holds the system module's models (backend-go rule §9).
package systemmdl

import (
	"encoding/json"
	"time"
)

// SystemInfoRsp is the body of GET /api/v1/system/info.
type SystemInfoRsp struct {
	Service   string    `json:"service"`
	Version   string    `json:"version"`
	StartedAt time.Time `json:"startedAt"`
}

func (r SystemInfoRsp) ToJSON() ([]byte, error) { return json.Marshal(r) }

// HealthRsp is the body of GET /healthz.
type HealthRsp struct {
	Status string `json:"status"`
}

func (r HealthRsp) ToJSON() ([]byte, error) { return json.Marshal(r) }

// ReadinessRsp is the body of GET /readyz.
type ReadinessRsp struct {
	Status string            `json:"status"`
	Checks map[string]string `json:"checks"`
}

func (r ReadinessRsp) ToJSON() ([]byte, error) { return json.Marshal(r) }

const (
	ReadinessReady    = "ready"
	ReadinessNotReady = "not_ready"
	CheckOK           = "ok"
	CheckNotConfigure = "not_configured"
)
