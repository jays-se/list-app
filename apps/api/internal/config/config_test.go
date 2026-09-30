package config

import (
	"testing"
	"time"
)

func env(values map[string]string) func(string) string {
	return func(key string) string { return values[key] }
}

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load(env(nil))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Env != EnvDev || cfg.HTTPAddr != ":8080" || cfg.ShutdownTimeout != 10*time.Second {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}
}

func TestLoadOverrides(t *testing.T) {
	cfg, err := Load(env(map[string]string{
		"APP_ENV": "test", "HTTP_ADDR": ":9000", "APP_VERSION": "1.2.3", "SHUTDOWN_TIMEOUT": "3s",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Env != EnvTest || cfg.HTTPAddr != ":9000" || cfg.Version != "1.2.3" || cfg.ShutdownTimeout != 3*time.Second {
		t.Fatalf("overrides not applied: %+v", cfg)
	}
}

func TestLoadRejectsInvalid(t *testing.T) {
	cases := map[string]map[string]string{
		"bad env":         {"APP_ENV": "staging"},
		"bad timeout":     {"SHUTDOWN_TIMEOUT": "soon"},
		"prod without db": {"APP_ENV": "prod"},
	}
	for name, values := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := Load(env(values)); err == nil {
				t.Fatal("expected an error")
			}
		})
	}
}
