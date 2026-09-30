package config

import (
	"strings"
	"testing"
	"time"
)

func env(values map[string]string) func(string) string {
	return func(key string) string { return values[key] }
}

var prodOK = map[string]string{
	"APP_ENV":              "prod",
	"DATABASE_URL":         "postgres://x",
	"PUBLIC_BASE_URL":      "https://list.example.com",
	"GOOGLE_CLIENT_ID":     "id",
	"GOOGLE_CLIENT_SECRET": "secret",
	"SESSION_SECRET":       strings.Repeat("s", 32),
}

func with(base map[string]string, overrides map[string]string) map[string]string {
	out := map[string]string{}
	for k, v := range base {
		out[k] = v
	}
	for k, v := range overrides {
		out[k] = v
	}
	return out
}

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load(env(nil))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Env != EnvDev || cfg.HTTPAddr != ":8080" || cfg.ShutdownTimeout != 10*time.Second {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}
	if cfg.AuthProvider != AuthProviderDev || len(cfg.SessionSecret) != 32 || cfg.CookieSecure {
		t.Fatalf("unexpected auth defaults: provider=%s secret=%d secure=%v", cfg.AuthProvider, len(cfg.SessionSecret), cfg.CookieSecure)
	}
	if cfg.SessionTTL != 720*time.Hour || cfg.PublicOrigin() != "http://localhost:5173" {
		t.Fatalf("ttl=%v origin=%s", cfg.SessionTTL, cfg.PublicOrigin())
	}
}

func TestLoadOverrides(t *testing.T) {
	cfg, err := Load(env(map[string]string{
		"APP_ENV": "test", "HTTP_ADDR": ":9000", "APP_VERSION": "1.2.3", "SHUTDOWN_TIMEOUT": "3s",
		"PUBLIC_BASE_URL": "http://localhost:5199/",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Env != EnvTest || cfg.HTTPAddr != ":9000" || cfg.Version != "1.2.3" || cfg.ShutdownTimeout != 3*time.Second {
		t.Fatalf("overrides not applied: %+v", cfg)
	}
	if cfg.PublicBaseURL != "http://localhost:5199" {
		t.Fatalf("trailing slash not trimmed: %q", cfg.PublicBaseURL)
	}
}

func TestLoadProduction(t *testing.T) {
	cfg, err := Load(env(prodOK))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.AuthProvider != AuthProviderGoogle || !cfg.CookieSecure {
		t.Fatalf("prod should default to google + secure cookies: %+v", cfg)
	}
}

func TestLoadRejectsInvalid(t *testing.T) {
	cases := map[string]map[string]string{
		"bad env":                {"APP_ENV": "staging"},
		"bad timeout":            {"SHUTDOWN_TIMEOUT": "soon"},
		"bad ttl":                {"SESSION_TTL": "-1h"},
		"relative base url":      {"PUBLIC_BASE_URL": "/app"},
		"unknown provider":       {"AUTH_PROVIDER": "github"},
		"google without creds":   {"AUTH_PROVIDER": "google"},
		"short secret":           {"SESSION_SECRET": "short"},
		"prod without db":        with(prodOK, map[string]string{"DATABASE_URL": ""}),
		"prod with dev provider": with(prodOK, map[string]string{"AUTH_PROVIDER": "dev"}),
		"prod without secret":    with(prodOK, map[string]string{"SESSION_SECRET": ""}),
		"prod over http":         with(prodOK, map[string]string{"PUBLIC_BASE_URL": "http://list.example.com"}),
	}
	for name, values := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := Load(env(values)); err == nil {
				t.Fatal("expected an error")
			}
		})
	}
}
