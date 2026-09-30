# Local development setup

## Prerequisites
- Node ≥ 22.18 (`.nvmrc`; native TypeScript type stripping is used for scripts) and pnpm 11
- Go 1.27 (`apps/api/go.mod`)
- PostgreSQL 17: via Docker (`pnpm stack:up`), or a local or portable install (see below)

## First run
```sh
pnpm install                      # also sets git core.hooksPath=.githooks
pnpm exec playwright install chromium
```

## Everyday commands
| Command | What it does |
|---|---|
| `pnpm dev` | Web and worker on http://localhost:5173. `/api` is proxied to `API_ORIGIN` (default `http://localhost:8080`). Set `WEB_PORT` to change the port. |
| `pnpm stack:up` | Docker: Postgres :5432, MinIO :9000, and the API on :8080 with the dev sign-in. Then run `pnpm dev`. |
| `cd apps/api && DATABASE_URL=… go run ./cmd/api` | API on :8080 without Docker. Sign-in uses the **dev identity provider** by default (`AUTH_PROVIDER=dev`): type any name and email. |
| `cd apps/api && DATABASE_URL=… go run ./cmd/api migrate up` | Applies migrations. `migrate down [N]` and `migrate status` also exist. |
| `pnpm check` | Lint, typecheck (worker, main, tools), boundaries, agents, tokens and unit tests |
| `pnpm test:coverage` | Unit tests with the 80% gate |
| `E2E_DATABASE_URL=… pnpm test:e2e` | Playwright. Builds, migrates and starts its own API on :18080 and web on :5199 against that database. |
| `cd apps/api && go test ./...` | API tests. Set `TEST_DATABASE_URL` to include the Postgres tests. |
| `pnpm gen:api` | Regenerates `packages/api-client/src/generated.ts` after editing `api/openapi.yaml` |
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

## Auth configuration

| Variable | Default | Notes |
|---|---|---|
| `AUTH_PROVIDER` | `dev` (`google` in prod) | `dev` is refused when `APP_ENV=prod` |
| `PUBLIC_BASE_URL` | `http://localhost:5173` | The browser origin. Used for the OAuth redirect URI and the CSRF Origin check, and must be https in prod. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | none | Required for `google`. The Google Cloud project is used only for these OAuth credentials (ADR-0013). |
| `SESSION_SECRET` | random per process in dev | At least 32 characters and required in prod. Signs the OAuth flow cookie and dev codes. |
| `SESSION_TTL` | `720h` | Session lifetime |

For Google sign-in locally, register the redirect URI `http://localhost:5173/api/v1/auth/google/callback`.

## Blob storage (attachments, ADR-0022)
| Variable | Default | Notes |
|---|---|---|
| `BLOB_DRIVER` | `local` | `local` (disk) or `s3` (MinIO, S3, R2…) |
| `BLOB_DIR` | `data/blobs` | Local driver only, relative to the API's working directory (gitignored) |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | none | Required for `s3` |
| `S3_REGION` / `S3_PATH_STYLE` | `us-east-1` / `true` | Use `S3_PATH_STYLE=false` for AWS virtual-hosted buckets |

For the optional S3 round-trip test, create a bucket and run:
`TEST_S3_ENDPOINT=http://127.0.0.1:9000 TEST_S3_BUCKET=… TEST_S3_ACCESS_KEY=… TEST_S3_SECRET_KEY=… go test ./internal/blobstore/`
