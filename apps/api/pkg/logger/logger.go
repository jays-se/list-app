// Package logger builds the application's structured JSON logger.
// Use this instead of the standard log package (backend-go rule §13).
package logger

import (
	"context"
	"io"
	"log/slog"
	"strings"
)

type ctxKey struct{}

// New returns a JSON slog.Logger writing to w at the given level
// ("debug", "info", "warn", "error"; default info).
func New(w io.Writer, level string) *slog.Logger {
	return slog.New(slog.NewJSONHandler(w, &slog.HandlerOptions{Level: parseLevel(level)}))
}

func parseLevel(level string) slog.Level {
	switch strings.ToLower(level) {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// WithContext stores a request-scoped logger (e.g. with request_id attached).
func WithContext(ctx context.Context, l *slog.Logger) context.Context {
	return context.WithValue(ctx, ctxKey{}, l)
}

// FromContext returns the request-scoped logger, or fallback when absent.
func FromContext(ctx context.Context, fallback *slog.Logger) *slog.Logger {
	if l, ok := ctx.Value(ctxKey{}).(*slog.Logger); ok {
		return l
	}
	return fallback
}
