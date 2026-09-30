import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8080"

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: {
      "/api": API_ORIGIN,
      "/healthz": API_ORIGIN,
      "/readyz": API_ORIGIN,
    },
  },
  worker: { format: "es" },
  build: { target: "es2023", sourcemap: true },
})
