# Testing strategy

| Layer | Tool | Scope | Gate |
|---|---|---|---|
| `@app/query`, `@app/domain`, `@app/protocol` | Vitest (node env) | Cache behavior, view models, validators, parsers (capture, markdown) | ≥80% line coverage |
| `@app/worker` + `@app/bridge` | Vitest with the inline backend | View subscribe/push, RPC timeouts, error codes, crash/restart | Required for each protocol change |
| React components | Vitest + Testing Library + jsdom | Interaction and rendering from fixture view models | Required for interactive components |
| API | Go tests against real Postgres (compose/testcontainers) | Handlers, policies (table-driven), tenant isolation, migrations | Required |
| Contract | OpenAPI diff + response schema checks | No breaking changes; responses match the spec | CI |
| E2E | Playwright against the compose stack (fake OIDC) | Happy path per story, a11y (axe), no main-thread network | Per story |
| Performance | Playwright trace, 2k-task fixture | Main-thread long tasks < 50 ms; bundle budget | Per milestone |

Specifics:
- **Postgres tests** run only when `TEST_DATABASE_URL` is set, and each one uses a throwaway schema. RLS tests switch to a `NOSUPERUSER NOBYPASSRLS` role, because superusers bypass RLS.
- **Main-thread network guard:** e2e tests stub `fetch`, `XMLHttpRequest`, `WebSocket` and `EventSource` on the main thread (`e2e/smoke.spec.ts`).
- **axe:** run it with `page.emulateMedia({ reducedMotion: "reduce" })` after a theme switch. Otherwise axe can sample colours mid-transition.
- **Contrast** is unit-tested from the tokens (`packages/ui-kit/src/tokens/contrast.test.ts`). Add a pair whenever you add a foreground/background role.
- **Contract:** `internal/app/contract_test.go` fails if the Go routes (for both providers) and `api/openapi.yaml` disagree. CI's `oasdiff` job fails on breaking changes. `pnpm check:api` fails if the generated TS types are stale.
- **API flows:** `internal/app/flow_test.go` drives real HTTP with cookie jars against Postgres: sign in through the dev provider, CSRF, validation, invite, rotate, switch and logout. The Google path is tested against an in-process OIDC server (`authsvc/google_test.go`).
- **E2E needs a database:** `E2E_DATABASE_URL`. Tests create unique people and workspaces and never reset the DB (see the `write-e2e-test` skill).

Rules:
- Test view models and validators as pure functions, with no mocks.
- Mock HTTP only at the `@app/api-client` boundary, using an in-house fake transport.
- Never test through timing sleeps. Use fake timers for polling and retry.
