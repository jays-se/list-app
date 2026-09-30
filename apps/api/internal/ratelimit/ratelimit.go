// Package ratelimit is an in-house token bucket per key (ADR-0025): no
// dependency, in memory per instance. Limits are generous per-IP guards
// against abuse, not quotas.
package ratelimit

import (
	"math"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
)

type bucket struct {
	tokens float64
	last   time.Time
}

// Limiter allows `burst` events at once, refilled at `per` per `window`.
type Limiter struct {
	rate    float64 // tokens per second
	burst   float64
	now     func() time.Time
	mu      sync.Mutex
	buckets map[string]*bucket
	calls   int
}

func New(per int, window time.Duration, burst int, now func() time.Time) *Limiter {
	if now == nil {
		now = time.Now
	}
	return &Limiter{rate: float64(per) / window.Seconds(), burst: float64(burst), now: now, buckets: map[string]*bucket{}}
}

// Allow takes one token for key, or says how long until one is available.
func (l *Limiter) Allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	l.calls++
	if l.calls%1024 == 0 {
		l.sweep(now)
	}
	b := l.buckets[key]
	if b == nil {
		b = &bucket{tokens: l.burst, last: now}
		l.buckets[key] = b
	}
	b.tokens = math.Min(l.burst, b.tokens+now.Sub(b.last).Seconds()*l.rate)
	b.last = now
	if b.tokens >= 1 {
		b.tokens--
		return true, 0
	}
	wait := time.Duration((1 - b.tokens) / l.rate * float64(time.Second))
	return false, wait
}

// sweep drops buckets that have refilled completely (idle keys).
func (l *Limiter) sweep(now time.Time) {
	for k, b := range l.buckets {
		if b.tokens+now.Sub(b.last).Seconds()*l.rate >= l.burst {
			delete(l.buckets, k)
		}
	}
}

// Rule limits requests that match.
type Rule struct {
	Name    string
	Match   func(*http.Request) bool
	Limiter *Limiter
}

// ClientIP is the remote address, or the first X-Forwarded-For hop when the
// API sits behind our own proxy (TRUST_PROXY_HEADERS=true).
func ClientIP(trustProxy bool) func(*http.Request) string {
	return func(r *http.Request) string {
		if trustProxy {
			if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
				return strings.TrimSpace(strings.Split(xff, ",")[0])
			}
		}
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			return r.RemoteAddr
		}
		return host
	}
}

// Middleware answers 429 problem+json with Retry-After when a rule's
// bucket for this client is empty.
func Middleware(rules []Rule, clientIP func(*http.Request) string, onLimited func(rule string)) apiserver.Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			for _, rule := range rules {
				if !rule.Match(r) {
					continue
				}
				if ok, wait := rule.Limiter.Allow(rule.Name + "|" + clientIP(r)); !ok {
					if onLimited != nil {
						onLimited(rule.Name)
					}
					w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(wait.Seconds()))))
					apiserver.RespondProblem(w, r, apiserver.Problem{
						Type: "rate_limited", Status: http.StatusTooManyRequests,
						Detail: "Too many requests. Try again in a moment.",
					})
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}
