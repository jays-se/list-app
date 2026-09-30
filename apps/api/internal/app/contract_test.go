package app_test

import (
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"gopkg.in/yaml.v3"

	"github.com/intellicars/list-app/apps/api/internal/app"
	"github.com/intellicars/list-app/apps/api/internal/config"
)

// TestContractMatchesOpenAPI keeps api/openapi.yaml and the registered routes
// identical (ADR-0002). Dev-only operations (x-dev-only) are expected only
// when the dev provider is configured.
func TestContractMatchesOpenAPI(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "api", "openapi.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	var spec struct {
		Paths map[string]map[string]yaml.Node `yaml:"paths"`
	}
	if err := yaml.Unmarshal(raw, &spec); err != nil {
		t.Fatal(err)
	}
	for _, provider := range []string{config.AuthProviderDev, config.AuthProviderGoogle} {
		t.Run(provider, func(t *testing.T) {
			var documented []string
			for path, ops := range spec.Paths {
				for method, node := range ops {
					switch method {
					case "get", "post", "put", "patch", "delete":
						var op struct {
							DevOnly bool `yaml:"x-dev-only"`
						}
						if err := node.Decode(&op); err != nil {
							t.Fatal(err)
						}
						if op.DevOnly && provider != config.AuthProviderDev {
							continue
						}
						documented = append(documented, strings.ToUpper(method)+" "+path)
					}
				}
			}
			sort.Strings(documented)

			cfg, err := config.Load(func(k string) string {
				return map[string]string{
					"AUTH_PROVIDER": provider, "GOOGLE_CLIENT_ID": "id", "GOOGLE_CLIENT_SECRET": "secret",
				}[k]
			})
			if err != nil {
				t.Fatal(err)
			}
			_, router := app.New(cfg, app.Options{Log: slog.New(slog.NewTextHandler(io.Discard, nil)), StartedAt: time.Now()})
			if got, want := strings.Join(router.Routes(), "\n"), strings.Join(documented, "\n"); got != want {
				t.Fatalf("OpenAPI and routes differ\nopenapi:\n  %s\nroutes:\n  %s",
					strings.ReplaceAll(want, "\n", "\n  "), strings.ReplaceAll(got, "\n", "\n  "))
			}
		})
	}
}
