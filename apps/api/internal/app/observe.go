package app

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
	"github.com/intellicars/list-app/apps/api/internal/metrics"
	"github.com/intellicars/list-app/apps/api/internal/outbox"
	"github.com/intellicars/list-app/apps/api/internal/ratelimit"
)

// requestMetrics records count and latency by route pattern (never the raw
// path, which would explode label cardinality).
func requestMetrics(reg *metrics.Registry, pattern func(*http.Request) string) apiserver.Middleware {
	total := reg.Counter("http_requests_total", "HTTP requests by route and status.", "route", "status")
	latency := reg.Histogram("http_request_duration_seconds", "HTTP latency by route.", metrics.DefBuckets, "route")
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &statusWriter{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rec, r)
			route := pattern(r)
			if route == "" {
				route = "unmatched"
			}
			total.Inc(route, strconv.Itoa(rec.status))
			latency.Observe(time.Since(start).Seconds(), route)
		})
	}
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (s *statusWriter) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

// Flush keeps streaming responses working through the wrapper.
func (s *statusWriter) Flush() {
	if f, ok := s.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// outboxGauges report the dispatcher's backlog at scrape time.
func outboxGauges(reg *metrics.Registry, pool *pgxpool.Pool) {
	query := func(sql string) (float64, bool) {
		if pool == nil {
			return 0, false
		}
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		var v float64
		if err := pool.QueryRow(ctx, sql).Scan(&v); err != nil {
			return 0, false
		}
		return v, true
	}
	reg.GaugeFunc("outbox_pending_events", "Outbox events not yet delivered.", func() (float64, bool) {
		return query(`SELECT count(*) FROM outbox WHERE processed_at IS NULL AND attempts < ` + strconv.Itoa(outbox.MaxAttempts))
	})
	reg.GaugeFunc("outbox_failed_events", "Outbox events that gave up after the maximum attempts.", func() (float64, bool) {
		return query(`SELECT count(*) FROM outbox WHERE processed_at IS NULL AND attempts >= ` + strconv.Itoa(outbox.MaxAttempts))
	})
	reg.GaugeFunc("outbox_oldest_pending_seconds", "Age of the oldest undelivered outbox event.", func() (float64, bool) {
		return query(`SELECT coalesce(extract(epoch FROM now() - min(created_at)), 0) FROM outbox WHERE processed_at IS NULL`)
	})
}

// rateRules are per-client-IP guards (ADR-0025).
func rateRules(enabled bool, now func() time.Time) []ratelimit.Rule {
	if !enabled {
		return nil
	}
	post := func(match func(path string) bool) func(*http.Request) bool {
		return func(r *http.Request) bool { return r.Method == http.MethodPost && match(r.URL.Path) }
	}
	return []ratelimit.Rule{
		{Name: "auth", Limiter: ratelimit.New(20, time.Minute, 20, now),
			Match: func(r *http.Request) bool {
				return strings.HasPrefix(r.URL.Path, "/api/v1/auth/") && r.URL.Path != "/api/v1/auth/me"
			}},
		{Name: "bulk", Limiter: ratelimit.New(30, time.Minute, 10, now),
			Match: post(func(p string) bool { return p == "/api/v1/tasks/bulk" })},
		{Name: "uploads", Limiter: ratelimit.New(120, time.Minute, 30, now),
			Match: post(func(p string) bool { return strings.HasSuffix(p, "/attachments") || strings.HasSuffix(p, "/files") })},
		{Name: "client_errors", Limiter: ratelimit.New(30, time.Minute, 10, now),
			Match: post(func(p string) bool { return p == "/api/v1/client-errors" })},
	}
}
