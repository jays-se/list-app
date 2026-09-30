package ratelimit

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestLimiter(t *testing.T) {
	now := time.Unix(0, 0)
	l := New(60, time.Minute, 2, func() time.Time { return now })
	for i := range 2 {
		if ok, _ := l.Allow("a"); !ok {
			t.Fatalf("burst %d denied", i)
		}
	}
	ok, wait := l.Allow("a")
	if ok || wait != time.Second {
		t.Fatalf("third = %v %v", ok, wait)
	}
	if ok, _ := l.Allow("b"); !ok {
		t.Fatal("other keys are independent")
	}
	now = now.Add(time.Second)
	if ok, _ := l.Allow("a"); !ok {
		t.Fatal("refilled after a second")
	}
	now = now.Add(time.Hour)
	l.sweep(now)
	if len(l.buckets) != 0 {
		t.Fatalf("idle buckets kept: %d", len(l.buckets))
	}
}

func TestMiddleware(t *testing.T) {
	l := New(1, time.Minute, 1, nil)
	limited := ""
	h := Middleware([]Rule{{Name: "bulk", Match: func(r *http.Request) bool { return r.URL.Path == "/bulk" }, Limiter: l}},
		ClientIP(true), func(rule string) { limited = rule })(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(204)
	}))
	do := func(path, xff string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("POST", path, nil)
		req.Header.Set("X-Forwarded-For", xff)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}
	if do("/bulk", "1.1.1.1").Code != 204 || do("/other", "1.1.1.1").Code != 204 {
		t.Fatal("first request and unmatched paths pass")
	}
	rec := do("/bulk", "1.1.1.1, 10.0.0.1")
	if rec.Code != 429 || rec.Header().Get("Retry-After") != "60" || limited != "bulk" {
		t.Fatalf("limited = %d %q %q", rec.Code, rec.Header().Get("Retry-After"), limited)
	}
	if do("/bulk", "2.2.2.2").Code != 204 {
		t.Fatal("another client passes")
	}
	req := httptest.NewRequest("GET", "/", nil)
	req.RemoteAddr = "9.9.9.9:1234"
	if ClientIP(false)(req) != "9.9.9.9" {
		t.Fatal("RemoteAddr host")
	}
	req.RemoteAddr = "weird"
	if ClientIP(false)(req) != "weird" {
		t.Fatal("unparseable RemoteAddr")
	}
}
