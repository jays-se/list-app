package apiserver_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
	"github.com/intellicars/list-app/apps/api/internal/modules/system/systemhdlr"
	"github.com/intellicars/list-app/apps/api/internal/modules/system/systemsvc"
)

var quiet = slog.New(slog.NewTextHandler(io.Discard, nil))

type fakeDB struct{ err error }

func (f fakeDB) Ping(context.Context) error { return f.err }

func newTestHandler(db systemsvc.Pinger, extra ...apiserver.RouteRegistrar) (http.Handler, *apiserver.Router) {
	started := time.Date(2026, 9, 30, 10, 0, 0, 0, time.UTC)
	system := systemhdlr.NewSystemHdlr(systemsvc.NewSystemSvc("list-api", "1.2.3", started, db))
	return apiserver.NewHandler(quiet, append([]apiserver.RouteRegistrar{system}, extra...))
}

func do(t *testing.T, h http.Handler, method, path string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, nil))
	return rec
}

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	return v
}

func TestSystemInfo(t *testing.T) {
	h, _ := newTestHandler(nil)
	rec := do(t, h, "GET", "/api/v1/system/info")
	if rec.Code != 200 || rec.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("status %d, content-type %q", rec.Code, rec.Header().Get("Content-Type"))
	}
	body := decode[map[string]string](t, rec)
	if body["service"] != "list-api" || body["version"] != "1.2.3" || body["startedAt"] != "2026-09-30T10:00:00Z" {
		t.Fatalf("unexpected body %v", body)
	}
}

func TestHealthAndReadiness(t *testing.T) {
	cases := []struct {
		name   string
		db     systemsvc.Pinger
		status int
		check  string
	}{
		{"no database", nil, 503, "not_configured"},
		{"database down", fakeDB{err: errors.New("refused")}, 503, "unreachable"},
		{"database up", fakeDB{}, 200, "ok"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h, _ := newTestHandler(c.db)
			if rec := do(t, h, "GET", "/healthz"); rec.Code != 200 {
				t.Fatalf("healthz = %d", rec.Code)
			}
			rec := do(t, h, "GET", "/readyz")
			body := decode[struct {
				Status string            `json:"status"`
				Checks map[string]string `json:"checks"`
			}](t, rec)
			if rec.Code != c.status || body.Checks["database"] != c.check {
				t.Fatalf("readyz = %d %+v", rec.Code, body)
			}
		})
	}
}

func TestProblemResponses(t *testing.T) {
	h, _ := newTestHandler(nil)

	rec := do(t, h, "GET", "/api/v1/nope")
	p := decode[apiserver.Problem](t, rec)
	if rec.Code != 404 || rec.Header().Get("Content-Type") != "application/problem+json" || p.Type != "not_found" || p.RequestID == "" {
		t.Fatalf("404: %d %q %+v", rec.Code, rec.Header().Get("Content-Type"), p)
	}

	rec = do(t, h, "POST", "/api/v1/system/info")
	p = decode[apiserver.Problem](t, rec)
	if rec.Code != 405 || p.Type != "method_not_allowed" || !strings.Contains(rec.Header().Get("Allow"), "GET") {
		t.Fatalf("405: %d %+v allow=%q", rec.Code, p, rec.Header().Get("Allow"))
	}
}

type panicky struct{}

func (panicky) RegisterRoutes(r *apiserver.Router) {
	r.Handle("GET /boom", func(http.ResponseWriter, *http.Request) { panic("kaboom") })
}

func TestRecoverAndHeaders(t *testing.T) {
	h, _ := newTestHandler(nil, panicky{})
	rec := do(t, h, "GET", "/boom")
	p := decode[apiserver.Problem](t, rec)
	if rec.Code != 500 || p.Detail != "Something went wrong." {
		t.Fatalf("panic: %d %+v", rec.Code, p)
	}
	if rec.Header().Get("X-Content-Type-Options") != "nosniff" || rec.Header().Get("X-Request-Id") == "" {
		t.Fatalf("missing security/request-id headers: %v", rec.Header())
	}
}

func TestRequestIDPropagation(t *testing.T) {
	h, _ := newTestHandler(nil)
	req := httptest.NewRequest("GET", "/healthz", nil)
	req.Header.Set("X-Request-Id", "client-supplied-123")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if got := rec.Header().Get("X-Request-Id"); got != "client-supplied-123" {
		t.Fatalf("request id = %q", got)
	}
	req.Header.Set("X-Request-Id", "bad id with spaces")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if got := rec.Header().Get("X-Request-Id"); got == "bad id with spaces" || got == "" {
		t.Fatalf("invalid inbound id should be replaced, got %q", got)
	}
}

func TestGracefulShutdown(t *testing.T) {
	h, _ := newTestHandler(nil)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- apiserver.ServeListener(ctx, quiet, ln, h, time.Second) }()

	res, err := http.Get("http://" + ln.Addr().String() + "/healthz")
	if err != nil || res.StatusCode != 200 {
		t.Fatalf("serve: %v %v", res, err)
	}
	res.Body.Close()
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("server did not shut down")
	}
}

func TestCSRF(t *testing.T) {
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) })
	h := apiserver.CSRF("http://localhost:5199", func(r *http.Request) bool { return r.URL.Path == "/api/v1/exempt" })(ok)
	cases := []struct {
		name, method, path string
		headers            map[string]string
		want               int
	}{
		{"safe method passes", "GET", "/api/v1/x", nil, 204},
		{"non-api path passes", "POST", "/healthz", nil, 204},
		{"exempt path passes", "POST", "/api/v1/exempt", nil, 204},
		{"missing header", "POST", "/api/v1/x", nil, 403},
		{"header ok, same origin", "POST", "/api/v1/x", map[string]string{"X-Requested-With": "app", "Origin": "http://localhost:5199"}, 204},
		{"header ok, no origin", "DELETE", "/api/v1/x", map[string]string{"X-Requested-With": "app"}, 204},
		{"foreign origin", "POST", "/api/v1/x", map[string]string{"X-Requested-With": "app", "Origin": "https://evil.example"}, 403},
		{"cross-site fetch", "POST", "/api/v1/x", map[string]string{"X-Requested-With": "app", "Sec-Fetch-Site": "cross-site"}, 403},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req := httptest.NewRequest(c.method, c.path, nil)
			for k, v := range c.headers {
				req.Header.Set(k, v)
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != c.want {
				t.Fatalf("got %d, want %d (%s)", rec.Code, c.want, rec.Body.String())
			}
		})
	}
}

func TestDecodeJSON(t *testing.T) {
	var dst struct {
		Name string `json:"name"`
	}
	cases := []struct {
		name, contentType, body string
		ok                      bool
		status                  int
	}{
		{"valid", "application/json", `{"name":"a"}`, true, 0},
		{"valid with charset", "application/json; charset=utf-8", `{"name":"a"}`, true, 0},
		{"wrong media type", "text/plain", `{"name":"a"}`, false, 415},
		{"malformed", "application/json", `{"name":`, false, 400},
		{"wrong type", "application/json", `{"name":1}`, false, 400},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/", strings.NewReader(c.body))
			req.Header.Set("Content-Type", c.contentType)
			rec := httptest.NewRecorder()
			if got := apiserver.DecodeJSON(rec, req, &dst); got != c.ok {
				t.Fatalf("ok = %v, want %v", got, c.ok)
			}
			if !c.ok && rec.Code != c.status {
				t.Fatalf("status = %d, want %d", rec.Code, c.status)
			}
		})
	}
}
