# Local development setup

## Prerequisites
- Node ≥ 22.18 (`.nvmrc`; native TypeScript type stripping is used for scripts) and pnpm 11
- Go 1.27 (`apps/api/go.mod`)
- PostgreSQL 17, only for the DB tests and for running the API with a database. Docker Compose (`pnpm stack:up`) arrives with E0-S4.

## First run
```sh
pnpm install                      # also sets git core.hooksPath=.githooks
pnpm exec playwright install chromium
```

## Everyday commands
| Command | What it does |
|---|---|
| `pnpm dev` | Web and worker on http://localhost:5173. `/api` is proxied to `API_ORIGIN` (default `http://localhost:8080`). Set `WEB_PORT` to change the port. |
| `cd apps/api && go run ./cmd/api` | API on :8080. Without `DATABASE_URL`, `/readyz` reports `not_ready` and everything else works. |
| `cd apps/api && DATABASE_URL=… go run ./cmd/api migrate up` | Applies migrations. `migrate down [N]` and `migrate status` also exist. |
| `pnpm check` | Lint, typecheck (worker, main, tools), boundaries, agents, tokens and unit tests |
| `pnpm test:coverage` | Unit tests with the 80% gate |
| `pnpm test:e2e` | Playwright. Starts its own API on :18080 and web on :5199. |
| `cd apps/api && go test ./...` | API tests. Set `TEST_DATABASE_URL` to include the Postgres tests. |
| `pnpm tokens` | Regenerates `packages/ui-kit/src/styles/tokens.css` after token edits |
| `pnpm sync:agents` | Regenerates the `.claude/` and `.cursor/` adapters after rule edits |

The `/_design` route (dev builds only) shows every token and component in each theme.

## Without Docker
If Docker isn't installed, a portable Postgres works for the DB tests. Run it TCP-only so the socket path limit doesn't apply:
```sh
initdb -D ./pgdata -U postgres -A trust
pg_ctl -D ./pgdata -o "-p 55432 -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -w start
TEST_DATABASE_URL="postgres://postgres@127.0.0.1:55432/postgres?sslmode=disable" go test ./internal/db/
```
