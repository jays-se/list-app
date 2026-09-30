// Package apiserver holds HTTP transport concerns shared by all modules:
// routing, middleware, problem+json responses and the server lifecycle.
package apiserver

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"
)

// NewHandler builds the root handler: the module routes wrapped in the
// standard middleware stack (outermost first). Extra middleware (e.g. CSRF)
// runs innermost, after logging and recovery.
func NewHandler(log *slog.Logger, registrars []RouteRegistrar, extra ...Middleware) (http.Handler, *Router) {
	router := NewRouter()
	for _, reg := range registrars {
		reg.RegisterRoutes(router)
	}
	stack := append([]Middleware{RequestID(log), Recover(log), AccessLog(log), SecurityHeaders}, extra...)
	return Chain(router, stack...), router
}

// Serve runs the HTTP server until ctx is cancelled, then shuts down
// gracefully within shutdownTimeout.
func Serve(ctx context.Context, log *slog.Logger, addr string, h http.Handler, shutdownTimeout time.Duration) error {
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("apiserver: listen %s: %w", addr, err)
	}
	return ServeListener(ctx, log, ln, h, shutdownTimeout)
}

// ServeListener is Serve on an existing listener (tests use port 0).
func ServeListener(ctx context.Context, log *slog.Logger, ln net.Listener, h http.Handler, shutdownTimeout time.Duration) error {
	srv := &http.Server{
		Handler:           h,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
		BaseContext:       func(net.Listener) context.Context { return ctx },
	}
	errCh := make(chan error, 1)
	go func() {
		log.Info("http_server_started", "addr", ln.Addr().String())
		errCh <- srv.Serve(ln)
	}()

	select {
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return fmt.Errorf("apiserver: serve: %w", err)
	case <-ctx.Done():
	}

	log.Info("http_server_stopping")
	shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), shutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("apiserver: shutdown: %w", err)
	}
	log.Info("http_server_stopped")
	return nil
}
