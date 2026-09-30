// Command api runs the List API.
//
//	api                 serve HTTP (default)
//	api migrate up      apply pending migrations
//	api migrate down N  roll back the latest N migrations (default 1)
//	api migrate status  print the current schema version
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
	"github.com/intellicars/list-app/apps/api/internal/app"
	"github.com/intellicars/list-app/apps/api/internal/config"
	"github.com/intellicars/list-app/apps/api/internal/db"
	"github.com/intellicars/list-app/apps/api/pkg/logger"
	dbresources "github.com/intellicars/list-app/apps/api/resources/db"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	cfg, err := config.FromEnv()
	if err != nil {
		return err
	}
	log := logger.New(os.Stdout, cfg.LogLevel).With("service", app.ServiceName, "env", cfg.Env)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if len(args) > 0 && args[0] == "migrate" {
		return migrate(ctx, log, cfg, args[1:])
	}
	return serve(ctx, log, cfg)
}

func serve(ctx context.Context, log *slog.Logger, cfg config.Config) error {
	opts := app.Options{Log: log, StartedAt: time.Now()}
	if cfg.DatabaseURL != "" {
		pool, err := db.Open(ctx, cfg.DatabaseURL)
		if err != nil {
			return err
		}
		defer pool.Close()
		opts.Pool = pool
	} else {
		log.Warn("database_not_configured", "hint", "set DATABASE_URL; /readyz reports not_ready and auth/workspace routes fail")
	}
	log.Info("auth_configured", "provider", cfg.AuthProvider, "public_base_url", cfg.PublicBaseURL)
	log.Info("blob_storage_configured", "driver", cfg.BlobDriver)
	a, err := app.Build(cfg, opts)
	if err != nil {
		return err
	}
	if opts.Pool != nil {
		a.RunBackground(ctx) // outbox dispatcher + DUE reminders (ADR-0023)
	}
	return apiserver.Serve(ctx, log, cfg.HTTPAddr, a.Handler, cfg.ShutdownTimeout)
}

func migrate(ctx context.Context, log *slog.Logger, cfg config.Config, args []string) error {
	if cfg.DatabaseURL == "" {
		return fmt.Errorf("migrate: DATABASE_URL is required")
	}
	pool, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	migs, err := db.LoadMigrations(dbresources.Migrations)
	if err != nil {
		return err
	}
	m := db.NewMigrator(pool, migs)

	cmd := "up"
	if len(args) > 0 {
		cmd = args[0]
	}
	switch cmd {
	case "up":
		applied, err := m.Up(ctx)
		log.Info("migrate_up", "applied", applied)
		return err
	case "down":
		steps := 1
		if len(args) > 1 {
			if steps, err = strconv.Atoi(args[1]); err != nil || steps < 1 {
				return fmt.Errorf("migrate down: N must be a positive integer")
			}
		}
		reverted, err := m.Down(ctx, steps)
		log.Info("migrate_down", "reverted", reverted)
		return err
	case "status":
		v, err := m.Version(ctx)
		log.Info("migrate_status", "version", v, "latest", migs[len(migs)-1].Version)
		return err
	default:
		return fmt.Errorf("migrate: unknown command %q (up, down [N], status)", cmd)
	}
}
