import { defineConfig, devices } from "@playwright/test"

const API_PORT = 18080
const WEB_PORT = 5199

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "go run ./cmd/api",
      cwd: "apps/api",
      url: `http://localhost:${API_PORT}/healthz`,
      env: {
        HTTP_ADDR: `:${API_PORT}`,
        APP_ENV: "test",
        APP_VERSION: "0.1.0-e2e",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @app/web dev",
      url: `http://localhost:${WEB_PORT}`,
      env: {
        API_ORIGIN: `http://localhost:${API_PORT}`,
        WEB_PORT: String(WEB_PORT),
      },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
})
