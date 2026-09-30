import { defineConfig, devices } from "@playwright/test"

const API_PORT = 18080
const WEB_PORT = 5199
const WEB_ORIGIN = `http://localhost:${WEB_PORT}`

// E2E runs the real API on PostgreSQL (CI provides a service container;
// locally see docs/local-setup.md). Each test uses unique users/workspaces,
// so the database never needs resetting.
const DATABASE_URL = process.env.E2E_DATABASE_URL
if (!DATABASE_URL) {
  throw new Error(
    "Set E2E_DATABASE_URL (e.g. postgres://postgres@127.0.0.1:55432/postgres?sslmode=disable)"
  )
}

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: WEB_ORIGIN,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command:
        "go build -o bin/api ./cmd/api && ./bin/api migrate up && ./bin/api",
      cwd: "apps/api",
      url: `http://localhost:${API_PORT}/readyz`,
      env: {
        HTTP_ADDR: `:${API_PORT}`,
        APP_ENV: "test",
        APP_VERSION: "0.1.0-e2e",
        AUTH_PROVIDER: "dev",
        DATABASE_URL,
        PUBLIC_BASE_URL: WEB_ORIGIN,
        LOG_LEVEL: "warn",
        BLOB_DIR: "data/e2e-blobs",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: "pnpm --filter @app/web dev",
      url: WEB_ORIGIN,
      env: {
        API_ORIGIN: `http://localhost:${API_PORT}`,
        WEB_PORT: String(WEB_PORT),
      },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
})
