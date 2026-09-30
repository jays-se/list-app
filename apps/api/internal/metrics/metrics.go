// Package metrics is a tiny in-house Prometheus registry (ADR-0025): counters,
// histograms and scrape-time gauges, written in the text exposition format.
// It isn't a cache, so a mutex is fine here (backend-go rule §2 is about caches).
package metrics

import (
	"fmt"
	"io"
	"math"
	"sort"
	"strconv"
	"strings"
	"sync"
)

type Registry struct {
	mu     sync.Mutex
	order  []string
	series map[string]collector
}

type collector interface{ write(w io.Writer) }

func New() *Registry { return &Registry{series: map[string]collector{}} }

func (r *Registry) add(name string, c collector) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, dup := r.series[name]; dup {
		panic("metrics: duplicate " + name)
	}
	r.series[name] = c
	r.order = append(r.order, name)
}

// WriteText writes every metric (Prometheus text format 0.0.4).
func (r *Registry) WriteText(w io.Writer) {
	r.mu.Lock()
	names := append([]string(nil), r.order...)
	r.mu.Unlock()
	for _, n := range names {
		r.series[n].write(w)
	}
}

func key(values []string) string { return strings.Join(values, "\x00") }

func labelText(names, values []string, extra ...string) string {
	parts := make([]string, 0, len(names)+1)
	for i, n := range names {
		parts = append(parts, n+`="`+escape(values[i])+`"`)
	}
	parts = append(parts, extra...)
	if len(parts) == 0 {
		return ""
	}
	return "{" + strings.Join(parts, ",") + "}"
}

func escape(s string) string {
	return strings.NewReplacer(`\`, `\\`, `"`, `\"`, "\n", `\n`).Replace(s)
}

// ---- counters ----

type CounterVec struct {
	name, help string
	labels     []string
	mu         sync.Mutex
	values     map[string]float64
	keys       map[string][]string
}

func (r *Registry) Counter(name, help string, labels ...string) *CounterVec {
	c := &CounterVec{name: name, help: help, labels: labels, values: map[string]float64{}, keys: map[string][]string{}}
	r.add(name, c)
	return c
}

func (c *CounterVec) Inc(values ...string) { c.Add(1, values...) }

func (c *CounterVec) Add(v float64, values ...string) {
	k := key(values)
	c.mu.Lock()
	c.values[k] += v
	c.keys[k] = values
	c.mu.Unlock()
}

// Value returns the current count (tests).
func (c *CounterVec) Value(values ...string) float64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.values[key(values)]
}

func (c *CounterVec) write(w io.Writer) {
	c.mu.Lock()
	defer c.mu.Unlock()
	fmt.Fprintf(w, "# HELP %s %s\n# TYPE %s counter\n", c.name, c.help, c.name)
	for _, k := range sortedKeys(c.values) {
		fmt.Fprintf(w, "%s%s %s\n", c.name, labelText(c.labels, c.keys[k]), num(c.values[k]))
	}
}

// ---- histograms ----

type HistogramVec struct {
	name, help string
	labels     []string
	buckets    []float64
	mu         sync.Mutex
	series     map[string]*hist
}

type hist struct {
	values []string
	counts []uint64
	sum    float64
	count  uint64
}

// DefBuckets are request-latency buckets in seconds.
var DefBuckets = []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5}

func (r *Registry) Histogram(name, help string, buckets []float64, labels ...string) *HistogramVec {
	h := &HistogramVec{name: name, help: help, labels: labels, buckets: buckets, series: map[string]*hist{}}
	r.add(name, h)
	return h
}

func (h *HistogramVec) Observe(v float64, values ...string) {
	k := key(values)
	h.mu.Lock()
	defer h.mu.Unlock()
	s := h.series[k]
	if s == nil {
		s = &hist{values: values, counts: make([]uint64, len(h.buckets))}
		h.series[k] = s
	}
	for i, b := range h.buckets {
		if v <= b {
			s.counts[i]++
		}
	}
	s.sum += v
	s.count++
}

func (h *HistogramVec) write(w io.Writer) {
	h.mu.Lock()
	defer h.mu.Unlock()
	fmt.Fprintf(w, "# HELP %s %s\n# TYPE %s histogram\n", h.name, h.help, h.name)
	keys := make([]string, 0, len(h.series))
	for k := range h.series {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		s := h.series[k]
		for i, b := range h.buckets {
			fmt.Fprintf(w, "%s_bucket%s %d\n", h.name, labelText(h.labels, s.values, `le="`+num(b)+`"`), s.counts[i])
		}
		fmt.Fprintf(w, "%s_bucket%s %d\n", h.name, labelText(h.labels, s.values, `le="+Inf"`), s.count)
		fmt.Fprintf(w, "%s_sum%s %s\n", h.name, labelText(h.labels, s.values), num(s.sum))
		fmt.Fprintf(w, "%s_count%s %d\n", h.name, labelText(h.labels, s.values), s.count)
	}
}

// ---- scrape-time gauges ----

type gaugeFunc struct {
	name, help string
	fn         func() (float64, bool)
}

// GaugeFunc reports fn() at scrape time; ok=false skips the sample.
func (r *Registry) GaugeFunc(name, help string, fn func() (float64, bool)) {
	r.add(name, &gaugeFunc{name: name, help: help, fn: fn})
}

func (g *gaugeFunc) write(w io.Writer) {
	v, ok := g.fn()
	if !ok {
		return
	}
	fmt.Fprintf(w, "# HELP %s %s\n# TYPE %s gauge\n%s %s\n", g.name, g.help, g.name, g.name, num(v))
}

func sortedKeys(m map[string]float64) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func num(v float64) string {
	if math.IsInf(v, 1) {
		return "+Inf"
	}
	return strconv.FormatFloat(v, 'g', -1, 64)
}
