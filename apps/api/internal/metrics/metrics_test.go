package metrics

import (
	"strings"
	"testing"
)

func TestTextFormat(t *testing.T) {
	r := New()
	c := r.Counter("http_requests_total", "Requests.", "route", "status")
	h := r.Histogram("http_request_duration_seconds", "Latency.", []float64{0.1, 1}, "route")
	r.GaugeFunc("outbox_pending_events", "Backlog.", func() (float64, bool) { return 3, true })
	r.GaugeFunc("skipped", "No sample.", func() (float64, bool) { return 0, false })
	c.Inc("GET /a", "200")
	c.Add(2, `GET /"b"`, "500")
	h.Observe(0.05, "GET /a")
	h.Observe(0.5, "GET /a")
	var b strings.Builder
	r.WriteText(&b)
	want := []string{
		"# TYPE http_requests_total counter",
		`http_requests_total{route="GET /a",status="200"} 1`,
		`http_requests_total{route="GET /\"b\"",status="500"} 2`,
		`http_request_duration_seconds_bucket{route="GET /a",le="0.1"} 1`,
		`http_request_duration_seconds_bucket{route="GET /a",le="1"} 2`,
		`http_request_duration_seconds_bucket{route="GET /a",le="+Inf"} 2`,
		`http_request_duration_seconds_sum{route="GET /a"} 0.55`,
		`http_request_duration_seconds_count{route="GET /a"} 2`,
		"outbox_pending_events 3",
	}
	for _, w := range want {
		if !strings.Contains(b.String(), w) {
			t.Fatalf("missing %q in\n%s", w, b.String())
		}
	}
	if strings.Contains(b.String(), "skipped") {
		t.Fatal("gauge with ok=false must be skipped")
	}
	if c.Value("GET /a", "200") != 1 {
		t.Fatal("Value")
	}
	defer func() {
		if recover() == nil {
			t.Fatal("duplicate names must panic")
		}
	}()
	r.Counter("http_requests_total", "dup")
}
