// Package config loads runtime configuration from environment variables
// (12-factor; ADR-0013). Every setting has a safe development default except
// where production requires an explicit value.
package config

import (
	"fmt"
	"os"
	"time"
)

type Env string

const (
	EnvDev  Env = "dev"
	EnvTest Env = "test"
	EnvProd Env = "prod"
)

type Config struct {
	Env             Env
	HTTPAddr        string
	DatabaseURL     string
	LogLevel        string
	Version         string
	ShutdownTimeout time.Duration
}

// Load reads configuration using getenv (os.Getenv in production, a map in tests).
func Load(getenv func(string) string) (Config, error) {
	get := func(key, fallback string) string {
		if v := getenv(key); v != "" {
			return v
		}
		return fallback
	}

	cfg := Config{
		Env:         Env(get("APP_ENV", string(EnvDev))),
		HTTPAddr:    get("HTTP_ADDR", ":8080"),
		DatabaseURL: getenv("DATABASE_URL"),
		LogLevel:    get("LOG_LEVEL", "info"),
		Version:     get("APP_VERSION", "0.1.0-dev"),
	}

	switch cfg.Env {
	case EnvDev, EnvTest, EnvProd:
	default:
		return Config{}, fmt.Errorf("config: APP_ENV must be dev, test or prod, got %q", cfg.Env)
	}

	timeout, err := time.ParseDuration(get("SHUTDOWN_TIMEOUT", "10s"))
	if err != nil {
		return Config{}, fmt.Errorf("config: SHUTDOWN_TIMEOUT: %w", err)
	}
	cfg.ShutdownTimeout = timeout

	if cfg.Env == EnvProd && cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("config: DATABASE_URL is required when APP_ENV=prod")
	}
	return cfg, nil
}

// FromEnv loads configuration from the process environment.
func FromEnv() (Config, error) { return Load(os.Getenv) }
