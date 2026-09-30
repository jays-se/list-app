# Architecture

The full rationale is in `mvp-plan.md` §3–§6. The decisions behind it are in `../ADR/`.

## System

```
Browser
 ├─ Main thread: React 19 + react-router (render only)
 │    components ─► @app/bridge (useView / useAction) ─► postMessage
 ├─ Dedicated Worker: data plane
 │    WorkerKernel ─► ViewRegistry (selectors → view models)
 │                 ─► @app/query (cache, dedupe, TTL/GC, polling, retry, abort, mutations)
 │                 ─► @app/api-client (fetch, credentials:'include', problem+json → AppError)
 │                 ─► @app/domain (tasks, requests, docs, clients, labels, inbox, workspace, capture, markdown)
 └─ Service Worker (post-MVP): Web Push
        │ same-origin /api/v1, cookie session
API: Go modular monolith (api/openapi.yaml)
 ├─ PostgreSQL (workspace_id tenancy, version columns)
 ├─ Object storage (presigned PUT/GET)
 ├─ Outbox → notification dispatcher
 └─ Scheduler (DUE reminders)
```

## Packages

| Package | Runs in | May import | Must not import |
|---|---|---|---|
| `apps/web` | main | `@app/bridge`, `@app/ui-kit`, `@app/protocol` (types only), `react-router` | `@app/query`, `@app/api-client`, `@app/domain`, `@app/worker` (the one exception is `src/worker/*.worker.ts`, the worker entry shim) |
| `@app/ui-kit` | main | `react` | any data package, including `@app/bridge` and `@app/protocol` |
| `@app/bridge` | main | `@app/protocol`, `react` | `@app/query`, `@app/domain`, `@app/api-client` |
| `@app/protocol` | both | nothing | anything |
| `@app/worker` | worker | `@app/domain`, `@app/query`, `@app/api-client`, `@app/protocol` | `react`, DOM (`entry.ts` alone touches `self`) |
| `@app/domain` | worker | `@app/query`, `@app/api-client`, `@app/protocol` | `react`, DOM |
| `@app/query` | worker | `@app/protocol` (only `stableHash`) | `react`, DOM, app packages |
| `@app/api-client` | worker | generated OpenAPI types | `react`, DOM |

## Data flow

A read:
1. The route renders.
2. It calls `useView("tasks.list", params)`.
3. The bridge sends the command `view.subscribe`.
4. The kernel resolves which queries the view needs, and `@app/query` fetches them, deduplicating and polling as configured.
5. The worker computes the view model and pushes it with `push view`.
6. The bridge mirror updates, and `useSyncExternalStore` re-renders.

A write:
1. `useAction("tasks.update").run(args)` sends an RPC.
2. The domain action validates the args, applies an optimistic patch, calls the API, and then either invalidates the affected queries or rolls the patch back.
3. The RPC replies with ok or with an error code.

## State ownership

| State | Owner |
|---|---|
| Server data, derived data, filters applied, counts | Worker view models |
| Filter and selection intent | URL search params (react-router) |
| Open/closed, focus, uncommitted input | React local state |
| Session | Server cookie (the worker sees 401 and pushes `session.expired`) |

## Enforcement
- `scripts/check-boundaries.mjs` (run by `pnpm check`, CI and the pre-commit hook) enforces the package table above, blocks network APIs on the main thread, blocks DOM/React in worker packages, and enforces the 500-line file cap.
- Biome's `noRestrictedImports` and `noRestrictedGlobals` give the same feedback in the editor.
- E2E: `e2e/smoke.spec.ts` replaces `fetch`, `XMLHttpRequest`, `WebSocket` and `EventSource` on the main thread with throwing stubs. The page can only show API data because the worker fetched it.

## Key files
| Concern | File |
|---|---|
| Message types, `ViewMap`/`ActionMap` | `packages/protocol/src/{messages,registry}.ts` |
| Query engine | `packages/query/src/{client,query}.ts` |
| View/action definitions | `packages/domain/src/runtime.ts`, `packages/domain/src/<feature>/` |
| Kernel (worker end) | `packages/worker/src/kernel.ts`, `create-kernel.ts`, `entry.ts` |
| Bridge (main end) and hooks | `packages/bridge/src/{bridge.ts,react.tsx,worker-backend.ts}` |
| Inline backend (tests) | `packages/worker/src/inline-backend.ts` |
| Web wiring | `apps/web/src/app/{data-plane.ts,router.tsx}`, `apps/web/src/worker/data-plane.worker.ts` |
| API | `apps/api/cmd/api/main.go`, `apps/api/internal/{apiserver,db,modules}` |

## Sign-in and sessions (Sprint 1)
```
Login page ──link──► GET /api/v1/auth/google/login?returnTo=…      (sets signed oauth_flow cookie)
          ──302───► Google (PKCE S256 + nonce)  |  dev provider form (dev/test only)
          ──302───► GET /api/v1/auth/google/callback?code&state   (state ↔ cookie, code exchange,
                                                                    ID token verified, user upserted)
          ──302───► returnTo, with the HttpOnly `sid` cookie       (only its SHA-256 is stored)
Worker:   session.current view = GET /auth/me (401 → "anonymous") + GET /workspaces
React:    RequireSession guard → /login?returnTo=… | /onboarding | page
```
- **CSRF:** unsafe `/api/*` requests need `X-Requested-With: app` (the worker always sends it). Cross-site `Sec-Fetch-Site` and foreign `Origin` headers are rejected.
- **Tenancy:** `RequireWorkspace` checks membership of the session's active workspace and puts `reqctx.Tenant` into the context. Services then run SQL inside `db.WithTenant`, which enforces RLS.
- **Workspace switch, create, join and logout** call `ctx.resetData()` in the worker. All cached data is cleared and every live view refetches, so nothing from the previous tenant remains.
