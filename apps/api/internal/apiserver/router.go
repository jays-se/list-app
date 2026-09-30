package apiserver

import (
	"net/http"
	"sort"
)

// RouteRegistrar is implemented by every module handler.
type RouteRegistrar interface {
	RegisterRoutes(r *Router)
}

// Router wraps the standard ServeMux (Go 1.22+ method/wildcard patterns),
// records every route for the OpenAPI contract test, and turns the mux's
// plain-text 404/405 responses into problem+json.
type Router struct {
	mux    *http.ServeMux
	routes []string
}

func NewRouter() *Router { return &Router{mux: http.NewServeMux()} }

// Handle registers a pattern such as "GET /api/v1/tasks/{id}".
func (r *Router) Handle(pattern string, h http.HandlerFunc) {
	r.mux.Handle(pattern, h)
	r.routes = append(r.routes, pattern)
}

// Pattern is the route pattern a request matches ("" when none), used as a
// low-cardinality metrics label.
func (r *Router) Pattern(req *http.Request) string {
	_, pattern := r.mux.Handler(req)
	return pattern
}

// Routes returns the registered patterns, sorted.
func (r *Router) Routes() []string {
	out := append([]string(nil), r.routes...)
	sort.Strings(out)
	return out
}

func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	if _, pattern := r.mux.Handler(req); pattern == "" {
		// No match: let the mux decide 404 vs 405 (and set Allow), but
		// replace its text body with a problem document.
		r.mux.ServeHTTP(&problemWriter{ResponseWriter: w, req: req}, req)
		return
	}
	r.mux.ServeHTTP(w, req)
}

// problemWriter intercepts the mux's 404/405 and writes a problem document
// instead; the mux's own text body is discarded.
type problemWriter struct {
	http.ResponseWriter
	req         *http.Request
	wroteHeader bool
	replaced    bool
}

func (p *problemWriter) WriteHeader(code int) {
	if p.wroteHeader {
		return
	}
	p.wroteHeader = true
	switch code {
	case http.StatusNotFound:
		p.replaced = true
		RespondNotFound(p.ResponseWriter, p.req,
			"No route matches "+p.req.Method+" "+p.req.URL.Path+".")
	case http.StatusMethodNotAllowed:
		p.replaced = true
		RespondProblem(p.ResponseWriter, p.req, Problem{
			Type: "method_not_allowed", Status: code,
			Detail: p.req.Method + " is not allowed on " + p.req.URL.Path + ".",
		})
	default:
		p.ResponseWriter.WriteHeader(code)
	}
}

func (p *problemWriter) Write(b []byte) (int, error) {
	if !p.wroteHeader {
		p.WriteHeader(http.StatusOK)
	}
	if p.replaced {
		return len(b), nil
	}
	return p.ResponseWriter.Write(b)
}
