import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

const WORKER_PACKAGES = ["protocol", "query", "api-client", "domain", "worker"]

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "worker",
          environment: "node",
          include: WORKER_PACKAGES.map((p) => `packages/${p}/src/**/*.test.ts`),
        },
      },
      {
        plugins: [react()],
        test: {
          name: "main",
          environment: "jsdom",
          setupFiles: ["./vitest.setup.main.ts"],
          include: [
            "packages/bridge/src/**/*.test.{ts,tsx}",
            "packages/ui-kit/src/**/*.test.{ts,tsx}",
            "apps/web/src/**/*.test.{ts,tsx}",
          ],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**"],
      exclude: ["**/*.test.*", "**/index.ts", "packages/worker/src/entry.ts"],
      thresholds: { lines: 80, functions: 80, branches: 75 },
    },
  },
})
