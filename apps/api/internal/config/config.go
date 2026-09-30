// Package config loads runtime configuration from environment variables
// (12-factor; ADR-0013). Every setting has a safe development default except
// where production requires an explicit value.
package config

import (
	"crypto/rand"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"
)

type Env string

const (
	EnvDev  Env = "dev"
	EnvTest Env = "test"
	EnvProd Env = "prod"
)

const (
	AuthProviderGoogle = "google"
	AuthProviderDev    = "dev"
)

type Config struct {
	Env             Env
	HTTPAddr        string
	DatabaseURL     string
	LogLevel        string
	Version         string
	ShutdownTimeout time.Duration

	// PublicBaseURL is the browser-facing origin (web + proxied /api), used
	// for the OAuth redirect URI and the CSRF Origin check.
	PublicBaseURL string
	AuthProvider  string
	// GoogleIssuer is overridable so tests can point at a fake OIDC server.
	GoogleIssuer       string
	GoogleClientID     string
	GoogleClientSecret string
	// SessionSecret signs the OAuth flow cookie and dev-provider codes.
	SessionSecret []byte
	SessionTTL    time.Duration
	CookieSecure  bool
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
		Env:                Env(get("APP_ENV", string(EnvDev))),
		HTTPAddr:           get("HTTP_ADDR", ":8080"),
		DatabaseURL:        getenv("DATABASE_URL"),
		LogLevel:           get("LOG_LEVEL", "info"),
		Version:            get("APP_VERSION", "0.1.0-dev"),
		PublicBaseURL:      strings.TrimRight(get("PUBLIC_BASE_URL", "http://localhost:5173"), "/"),
		GoogleIssuer:       get("GOOGLE_ISSUER", "https://accounts.google.com"),
		GoogleClientID:     getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: getenv("GOOGLE_CLIENT_SECRET"),
	}

	switch cfg.Env {
	case EnvDev, EnvTest, EnvProd:
	default:
		return Config{}, fmt.Errorf("config: APP_ENV must be dev, test or prod, got %q", cfg.Env)
	}

	var err error
	if cfg.ShutdownTimeout, err = time.ParseDuration(get("SHUTDOWN_TIMEOUT", "10s")); err != nil {
		return Config{}, fmt.Errorf("config: SHUTDOWN_TIMEOUT: %w", err)
	}
	if cfg.SessionTTL, err = time.ParseDuration(get("SESSION_TTL", "720h")); err != nil || cfg.SessionTTL <= 0 {
		return Config{}, fmt.Errorf("config: SESSION_TTL must be a positive duration")
	}

	base, err := url.Parse(cfg.PublicBaseURL)
	if err != nil || (base.Scheme != "http" && base.Scheme != "https") || base.Host == "" {
		return Config{}, fmt.Errorf("config: PUBLIC_BASE_URL must be an absolute http(s) URL, got %q", cfg.PublicBaseURL)
	}
	cfg.CookieSecure = base.Scheme == "https"

	defaultProvider := AuthProviderDev
	if cfg.Env == EnvProd {
		defaultProvider = AuthProviderGoogle
	}
	cfg.AuthProvider = get("AUTH_PROVIDER", defaultProvider)
	switch cfg.AuthProvider {
	case AuthProviderGoogle:
		if cfg.GoogleClientID == "" || cfg.GoogleClientSecret == "" {
			return Config{}, fmt.Errorf("config: AUTH_PROVIDER=google needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET")
		}
	case AuthProviderDev:
		if cfg.Env == EnvProd {
			return Config{}, fmt.Errorf("config: AUTH_PROVIDER=dev is not allowed when APP_ENV=prod")
		}
	default:
		return Config{}, fmt.Errorf("config: AUTH_PROVIDER must be google or dev, got %q", cfg.AuthProvider)
	}

	secret := getenv("SESSION_SECRET")
	switch {
	case secret != "" && len(secret) < 32:
		return Config{}, fmt.Errorf("config: SESSION_SECRET must be at least 32 characters")
	case secret != "":
		cfg.SessionSecret = []byte(secret)
	case cfg.Env == EnvProd:
		return Config{}, fmt.Errorf("config: SESSION_SECRET is required when APP_ENV=prod")
	default:
		// Dev/test: a per-process secret; in-flight logins don't survive restarts.
		cfg.SessionSecret = make([]byte, 32)
		_, _ = rand.Read(cfg.SessionSecret)
	}

	if cfg.Env == EnvProd {
		if cfg.DatabaseURL == "" {
			return Config{}, fmt.Errorf("config: DATABASE_URL is required when APP_ENV=prod")
		}
		if !cfg.CookieSecure {
			return Config{}, fmt.Errorf("config: PUBLIC_BASE_URL must be https when APP_ENV=prod")
		}
	}
	return cfg, nil
}

// PublicOrigin is scheme://host[:port] of PublicBaseURL.
func (c Config) PublicOrigin() string {
	u, _ := url.Parse(c.PublicBaseURL)
	return u.Scheme + "://" + u.Host
}

// FromEnv loads configuration from the process environment.
func FromEnv() (Config, error) { return Load(os.Getenv) }
