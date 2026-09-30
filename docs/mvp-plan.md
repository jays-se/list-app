# MVP Plan — Team Tasks/Docs/Capture product (functional parity with list.intellicar.app)

## Context

We are building a new product whose **functional surface** matches `https://list.intellicar.app/` (team action items, change-request approvals, docs, clients, labels, inbox, quick capture). The reference is used only as a functional/API reference; its UI/UX and stack (React + TanStack Query + Tiptap) are **not** copied.

User direction (this conversation, 2026-09-30):
- Routing with **react-router**; an **in-house query library** instead of TanStack Query; avoid external libs where reasonable.
- **React renders only.** Query calls, data computation, transformation and data state live in a **Web Worker**. Reference: `/Users/jayshrivastava/CWF/fms-ui/packages` (`@fms/query`, `@fms/data-stores`) and the unmerged `@fms/realtime` worker package (branch `origin/changes/karan-rohit`, `packages/realtime/ARCHITECTURE.md`).
- **Keep documentation of our conversation** in the repo.

Decisions confirmed by the user:
| # | Decision |
|---|---|
| D1 | New repo at `/Users/jayshrivastava/CWF/list-app` (working name; rename later). |
| D2 | We build our own backend (contract-first). |
| D3 | TypeScript strict across frontend packages. |
| D4 | Docs in MVP use a markdown editor; rich text is post-MVP (ADR). |

Nothing is coded until this plan is approved. Step 1 after approval is to put this plan into the repo as `docs/` + `ADR/` + `AGENTS.md`. Step 2 is Sprint 0.

---

## 1. Functional analysis (from the reference bundle and API probes)

All confirmed from the JS bundle unless marked *[inferred]*. The API is same-origin `/api/v1`, uses cookie sessions and returns RFC 7807 problem+json errors (a live probe returned `401 {"type":"unauthenticated","title":"Unauthorized","status":401,"detail":"sign in required"}`). There are no websockets: task lists poll every 15 s, task detail every 10 s, the inbox every 20 s, and `/auth/me` is cached for 5 min.

**Entities**
- **User**: `id, name, email, image`
- **Workspace**: `id, name, inviteCode`. A user can belong to several and has one *active* workspace.
- **Member**: `id, name, email, image, role`. The role enum is unknown; the creator is the owner.
- **Task**
  - Core fields: `title, description, status, priority, startDate, endDate, dueDate, client, parent`.
  - Relations: `assignees[], owners[], labels[], checklist[], subtasks[], comments[], attachments[], requests[]`.
  - Counters: subtasks, checklist, comments and pending requests.
  - `viewer{canManage, canManageOwners, isAssignee}`.
- **ChangeRequest**: `id, kind, status, summary, note, requester, reviewer, targets[], createdAt`
- **Doc**: `id, title, content, clientId, attachments[], createdBy, createdAt`
- **Client**: `id, name, email, phone, color, notes` (plus task and doc counts *[inferred]*)
- **Label**: `id, name, color`
- **Notification**: `id, kind, readAt, task{id,title}, commentBody, detail`. The API also returns an `unread` count, and there are per-kind settings.
- **History**: activity items `{kind, field, from, to, subject, actor, createdAt}` and status stages `{status, enteredAt, leftAt}`.

**Enums**
- **Task status**: BACKLOG, TODO, IN_PROGRESS, TESTING, DONE, CANCELED
- **Priority**: URGENT, HIGH, MEDIUM, LOW, NONE (default)
- **Request kind**: UPDATE, ASSIGNEE_ADD, ASSIGNEE_REMOVE, ATTACHMENT_ADD, ATTACHMENT_REMOVE, SUBTASK_ADD, CHECKLIST_ADD, CHECKLIST_UPDATE, CHECKLIST_REMOVE
- **Request status**: PENDING, APPROVED, REJECTED, CANCELED ("withdrawn")
- **Notification kind**: MENTION, ASSIGNED, STATUS, DUE, REQUEST, REVIEWED
- **Capture source**: MEETING_NOTE, PERSONAL
- **History kinds**: about 30, covering CREATED/STATUS/UPDATED and add/remove events for assignees, labels, checklist, owners, attachments, subtasks and requests.

**Workflows**
1. **Sign-in and onboarding.** Sign-in is Google OAuth only. The login page shows a message for each error code: `state`, `denied`, `oauth`, `internal`. With no active workspace the user goes to onboarding to create a workspace (name 1–100 chars) or join one by invite code. Switching workspace clears all cached data.
2. **Task lifecycle.** A user creates a task, moves it through statuses, and deletes it.
   - Required on create: title, start date and end date. The end date must be on or after the start date.
   - List filters: status, mine, assignee, label, client, parent. The reference has no pagination, sort or search.
3. **Permission model.** There are three roles on a task:
   - **Manage** (creator or owner): edits directly with PATCH, sending only changed fields.
   - **Request** (assignee who is not a manager): can only propose changes to status, dates, assignees, attachments, subtasks and checklist. Each proposal is a ChangeRequest with an optional note of at most 1000 chars. Managers approve or reject it; the requester can withdraw it.
   - **View**: everyone else.

   Only users with `canManageOwners` can add owners.
4. **Collaboration.**
   - Comments support @mentions.
   - Checklist items can be assigned.
   - Subtasks are tasks with a `parentId`.
   - Attachments: at most 5 files of 5 MB each per task. Doc uploads are at most 20 MB.
5. **History.** Each task has an activity feed and shows time spent in each status. A removed user is shown as "a former member".
6. **Dashboard.** Shows counts for my open tasks, overdue, due this week, awaiting review and unassigned. It also lists upcoming tasks (8), the review queue, counts by status and workload per member.
7. **Calendar.** A month grid of tasks by `dueDate`, plus a list of tasks with no date.
8. **Inbox.** All/unread filters, mark one or all as read, per-kind push settings, and Web Push (VAPID) through a service worker.
9. **Quick capture.** The user pastes text. It is split on newlines; bullets (`- * •`) and `1.`/`1)` numbering are stripped and empty lines dropped. The user reviews the lines, then they are bulk-created with a source.
10. **Docs.** List, create, rename, link to a client, autosave with debounce, upload a file as a doc, attach files, and delete with a confirm.
11. **Clients.** Create, read, update and delete. A client detail page shows linked tasks and docs. Deleting a client unlinks its tasks and docs; it does not delete them.
12. **Labels and settings.** Create and delete labels; show the invite code, members, clients and labels.

**Edge cases to preserve**
- Warn before discarding unsaved changes in the task drawer.
- A request that is awaiting approval shows a per-field "pending" marker.
- Mention a user who has since left.
- Errors from concurrent edits.
- Opening a notification for a deleted task.
- Opening a stale invite code.
- The OAuth `state` has expired.
- File-size overflow and file-read failures.
- Workspace switch while requests are in flight: abort them and clear the cache.

**MVP vs post-MVP**
- **MVP:** everything in workflows 1–12 except the items below.
- **Post-MVP:**
  - Web Push (the in-app inbox is MVP)
  - Rich-text docs and task embeds inside docs
  - Realtime over SSE or WS instead of polling
  - Search, pagination and export
  - Offline mode and multi-tab SharedWorker
  - Email notifications
  - Additional SSO providers and a mobile app

## 2. Assumptions and open questions

**Assumptions**
- A1: Google is the only identity provider for MVP. Workspace roles are `OWNER | MEMBER`.
- A7: **Membership lifecycle** (decided 2026-09-30):
  - A member can **leave** a workspace, and an owner can **remove** a member.
  - The last owner can't leave or be removed until they promote another member to owner.
  - When someone leaves or is removed:
    - Their access ends immediately.
    - They're taken off the assignees, owners and checklist items of open tasks, and a history event is written for each.
    - Their pending change requests are cancelled.
    - Their authored content (tasks, comments, docs) stays, shown as "a former member".
  - They can rejoin only with a valid invite code, so an owner rotates the code to block them.
- A2: Workspace size is under about 200 members and under about 10k tasks, so lists can be fetched in full. The API is still designed with cursor pagination so it can grow later.
- A3: Attachments go to object storage through a presigned upload. The reference sends base64 in JSON; we do not copy that.
- A4: Polling matches the reference cadence in MVP. SSE is planned post-MVP behind the same worker query API.
- A5: The UI is web desktop-first and responsive. English only, with i18n-ready strings.
- A6: Our design system is our own, **modelled on Microsoft Fluent 2 design principles** (ADR-0014). It is built in-house; we don't use the `@fluentui/*` packages. We don't adopt the look of either reference app.

**Questions (they don't block Sprint 0)**
- ~~Q1~~ **Resolved:** we'll build our own design system, referencing Fluent 2 (ADR-0014).
- ~~Q2~~ **Resolved:** no cloud provider yet. We run everything locally with Docker and deploy the same containers to one host when needed (ADR-0013).
- ~~Q3~~ **Resolved:** Go (ADR-0003, accepted).
- ~~Q4~~ **Resolved:** DUE reminders are in the MVP, as a daily in-process job (E9-S1).
- Q5 (partly resolved): member removal is decided (A7). **Still open:** data retention periods and audit-log requirements.

## 3. High-level architecture

```
Browser
 ├─ Main thread: React 19 + react-router (render only)
 │    ui components ─► @app/bridge hooks (useView / useAction) ─► postMessage
 ├─ Dedicated Worker (@app/worker): the data plane
 │    WorkerKernel ─► ViewRegistry (selectors → view models)
 │                 ─► @app/query (cache, dedupe, TTL, GC, polling, retry, abort, mutations)
 │                 ─► @app/api-client (fetch, credentials:'include', problem+json → AppError)
 │                 ─► domain modules (tasks, docs, clients, labels, inbox, workspace, capture, markdown)
 └─ Service Worker (post-MVP): Web Push
         │ HTTPS, same-origin /api/v1 (cookie session)
API (modular monolith, contract-first OpenAPI 3.1)
 ├─ modules: auth, workspace, task, request, history, doc, client, label, notification, capture
 ├─ PostgreSQL (single DB; tenant column workspace_id + row-level checks)
 ├─ Object storage (GCS/S3) with presigned PUT/GET for attachments
 ├─ Transactional outbox → in-process notifier (MVP) → queue (post-MVP)
 └─ Scheduler (DUE reminders)
```

- **Frontend.** A SPA built with Vite. The worker is the only place that talks to the network. See §5–6.
- **Backend.** A modular monolith with hexagonal modules (`handler → service → repository`). Every write goes through a domain service that emits history rows and outbox events in the same transaction. Split into services only when load requires it.
- **Database.** PostgreSQL 16 with migrations tracked in the repo.
  - Tables: `users, workspaces, memberships, tasks, task_assignees, task_owners, task_labels, checklist_items, comments, comment_mentions, attachments, change_requests, task_events (history), task_status_stages, docs, doc_attachments, clients, labels, notifications, notification_settings, sessions, outbox`.
  - Every table has `workspace_id` and matching indexes.
  - Optimistic concurrency uses a `version` column, and the API returns an `ETag`.
- **Authentication.** Server-side Google OIDC (authorization code + PKCE), with a signed `state` and `nonce`.
  - The session is an opaque id in a `HttpOnly; Secure; SameSite=Lax` cookie; session rows are stored server-side.
  - CSRF protection: the server checks `Origin`/`Sec-Fetch-Site` on unsafe methods and requires a custom header `X-Requested-With: app`. The worker always sends it.
- **Authorization.**
  - Workspace membership middleware sets the tenant.
  - A task policy function computes `viewer{canManage, canManageOwners, isAssignee, canRequest}`. The API returns it with the task, and the same function enforces it server-side.
  - The UI only reflects the flags; it never decides permissions.
- **Files.**
  - The client requests an upload slot (`POST /uploads` → presigned URL plus `attachmentId`), PUTs the bytes directly (the worker does this), then confirms.
  - Size and MIME limits are checked twice: in the worker before upload and on the server when confirming.
  - Downloads go through a short-lived signed GET.
- **Notifications and events.** The outbox table is processed by an in-process dispatcher that creates notification rows (MENTION, ASSIGNED, STATUS, REQUEST, REVIEWED). A daily scheduler creates DUE notifications. Web Push and email are consumers added post-MVP.
- **Observability.**
  - Backend: OpenTelemetry traces and metrics, structured JSON logs with `request_id`, `workspace_id` and `user_id`, `/healthz` and `/readyz`, and an SLO dashboard.
  - Frontend: the worker and main thread report errors to one reporter, and the worker has a `fatal` channel. RPC latency is traced with worker spans. Web-vitals are sampled.
- **Deployment and CI/CD.**
  - GitHub Actions runs lint, typecheck, unit tests, contract tests (OpenAPI diff), build, e2e (Playwright on an ephemeral stack via docker-compose), then builds images.
  - **Cloud-agnostic (ADR-0013).** No managed cloud services in MVP.
    - `docker compose` runs Caddy/nginx (serving the static web build and reverse-proxying `/api`), the Go API, PostgreSQL, and MinIO (S3-compatible). The same stack is used locally and on any single Linux VM when a shared environment is needed.
    - Object storage is behind an S3-compatible interface, so moving to S3/GCS/R2 later is a config change.
    - Backups: nightly `pg_dump` and MinIO mirroring to a second disk or host.
  - Environments: `local` now. Add `staging` (one VM) once there are external users, and `prod` at launch.
  - DB migrations run as a one-shot container before the API starts.
- **Security.**
  - OWASP ASVS L2 baseline.
  - Strict CSP (`script-src 'self'`, `worker-src 'self'`) and escaped markdown rendering (sanitized in the worker, rendered from a safe AST).
  - Rate limits on auth, uploads and bulk endpoints.
  - Invite codes are rotatable and at least 128 bits.
  - Tenant isolation tests.
  - Secrets live in a secret manager.
  - Dependency scanning.
  - Uploaded files are served with `Content-Disposition: attachment`.

## 4. Backend architecture recommendation (language-independent first)

- **Style:** contract-first REST. `api/openapi.yaml` is the source of truth. Server stubs and TS types are generated from it, and CI fails on breaking diffs. The reference envelope shapes are kept (`{tasks}`, `{task}`, problem+json) to make parity testing easy.
- **Patterns:**
  - Modular monolith with ports and adapters.
  - Commands and queries separated inside each module; this is CQRS-lite, not event sourcing.
  - Transactional outbox for side effects.
  - Idempotency keys on bulk and create endpoints (`Idempotency-Key` header).
  - Policy objects for authorization.
- **Change-request engine:** the request `payload` is typed per `kind`.
  - Approving a request applies it through the same domain command as a direct manager edit, so it is validated identically.
  - Conflicts use optimistic `version`. A stale request fails with 409 problem+json of type `conflict`.
- **History:** append-only `task_events`, plus `task_status_stages` maintained when the status changes, which makes durations cheap to compute.
- **Language recommendation:** **Go** (see ADR-0003).
  - It matches the existing Intellicar backend conventions in `demo-ui/.cursor/rules/backend-service-rule.mdc`: the `{module}mdl/{module}svc/{module}hdlr` layout, and PostgreSQL NOTIFY for cache invalidation.
  - Single binary, low memory, strong standard library `net/http`.
  - Alternatives kept in the ADR: Node/TS with Fastify (one language across the stack), and Kotlin with Spring (enterprise ecosystem).

## 5. Frontend options comparison

| Option | Architecture | Pros | Cons | DX / Testing / Ecosystem / Hiring | Fit |
|---|---|---|---|---|---|
| **React SPA (Vite) + react-router + worker data plane** | CSR SPA; data plane in a Dedicated Worker; React subscribes through `useSyncExternalStore` | Largest ecosystem and hiring pool; team already knows it (fms-ui, demo-ui); RR7 data router; clean isolation for "render only"; fms-ui already has patterns for the query lib and the worker protocol | Must build our own query cache and worker bridge; SPA first load; worker boundary adds serialization cost | Excellent DX with Vite HMR, including for workers; Vitest, RTL and Playwright; very large hiring pool | **Best** |
| React + RR7 framework mode / Next.js (SSR/RSC) | Server-rendered with server data loaders | SEO, fast first paint, server-side data | Data logic moves to the server and conflicts with the worker-owned data plane; authenticated app needs no SEO; more infra (Node runtime) | Good DX; RSC mental model is newer; hiring is good | Weak: fights the core constraint |
| SolidJS / SolidStart | Fine-grained signals | Top runtime performance, small bundles | Smaller ecosystem and hiring pool; team would need to retrain | Good DX; smaller testing ecosystem | Medium |
| Svelte 5 / SvelteKit | Compiler plus runes | Little boilerplate, fast | Team has no React-to-Svelte experience; smaller hiring pool | Good DX | Medium |
| Vue 3 / Nuxt | Reactive SFCs | Mature, good DX | Team switch; the worker pattern works but gives no gain | Good ecosystem; medium hiring | Medium |
| Angular 20 (signals) | Opinionated framework with DI | Strong structure for large teams | Heavy; the team would need to retrain; its built-in HTTP stack does not suit a worker-owned data plane | Strong testing tooling; enterprise hiring | Low |
| Lit / Web Components | Standards-based | No framework lock-in, tiny | We would build a lot ourselves (router, forms, a11y) | Thin ecosystem | Low |
| HTMX + server templates | Hypermedia | Very simple, almost no client JS | Rich interactive drawer/request flows and a worker data plane don't fit | Easy hiring for the backend | Low |

**Recommendation: React 19 + Vite + react-router (data router) + in-house `@app/query` running in a Dedicated Worker.**

Why this over the alternatives:
- The "render only" constraint is easiest to meet when the data layer is framework-agnostic TypeScript in a worker. React is then a thin view layer and could be replaced later.
- It reuses proven local patterns:
  - `@fms/query`: the `QueryCache`/`QueryObserver` external store and `useSyncExternalStore` binding.
  - `@fms/realtime`: the command/rpc/push protocol, `RealtimeClient` timeouts and error codes, and inline backend for tests.
- It keeps hiring and the team's existing skills.

We do not copy the reference's TanStack Query or Tiptap choices.

## 6. Recommended frontend stack and boundaries

**Libraries (kept small)**
- Runtime dependencies: `react`, `react-dom`, `react-router`. Nothing else at runtime in MVP; each new dependency needs an ADR.
- Dev tooling: `vite`, `typescript`, `biome`, `vitest`, `@testing-library/react`, `playwright`.
- Styling: our own CSS with custom-property tokens and CSS Modules.
- In-house instead of libraries: markdown renderer, date utilities (`Intl` plus small helpers), form validators and schema decoders (a small `decode` combinator library).

**Packages** (pnpm workspace; packages are consumed as source, as in fms-ui)
```
list-app/
  apps/web/            React UI + router only (routes/, ui/, components/, styles/)
  apps/api/            backend (Go)
  packages/protocol/   typed Main↔Worker messages (command | rpc | push), error codes, ViewKey/ActionKey maps
  packages/query/      in-house query engine (runs in worker; framework-free)
  packages/api-client/ fetch wrapper, problem+json → AppError, decoders generated from OpenAPI types
  packages/domain/     per-feature modules: queries, actions, selectors/view-models, validators, pure transforms
  packages/worker/     WorkerKernel, ViewRegistry, worker entry, inline backend (tests/SSR-less)
  packages/bridge/     main-thread client (RPC timeouts, push fan-out) + React hooks useView/useAction/useBridgeStatus
  packages/ui-kit/     presentational primitives (Button, Drawer, Dialog, Field…) — no data imports
  api/openapi.yaml     contract
  ADR/  docs/  .agents/  AGENTS.md   (.claude/ and .cursor/ are generated adapters)
```

**`@app/query` (worker side).** Based on `fms-ui/packages/query`, extended with what that code is missing:
- Kept: keyed cache with prefix matching (`matchQueryKey`), in-flight dedupe, `ttl`/`gcTime`, and `AbortController` cancellation.
- Added: `refetchInterval` polling that pauses when the tab is hidden (the main thread forwards `visibilitychange`) or when a query has no subscribers.
- Added: retry with exponential backoff that never retries 4xx responses.
- Added: `invalidate(prefix)`, `setQueryData`, and `clearAll()` on workspace switch.
- Added: mutations with `onMutate` optimistic patching, rollback and `invalidates` declarations.
- Added: stable key hashing with sorted-key JSON, instead of `JSON.stringify` order sensitivity.

**Worker view models.**
- `ViewRegistry` maps `viewKey → { deps(params) → queryKeys[], compute(snapshots, params) → VM }`. Examples: `tasks.list`, `tasks.detail`, `dashboard.summary`, `calendar.month`, `inbox.list`, `capture.preview`, `docs.rendered`.
- Subscriptions are ref-counted by `(viewKey, hash(params))`.
- When a query changes, the VM is recomputed. It is pushed only when its structural hash changes, and notifications are batched per microtask.
- VMs are already display-ready: grouping, counts, relative dates, permission-derived `editMode`, pending-field markers, and status-stage durations.

**`@app/bridge` (main thread).**
- `useView(key, params) → {status, data, error, isFetching, updatedAt}` uses `useSyncExternalStore` over a main-side snapshot mirror.
- `useAction(key) → {run, pending, error}` sends an RPC that resolves after the worker applies the mutation.
- The RPC contract (10 s timeout, `BAD_REQUEST | FAILED | TIMEOUT | WORKER_FAILED | HTTP_<code>`) follows `@fms/realtime`'s client.
- Worker crash: the bridge restarts the worker once and surfaces a fatal banner if it fails again.

**React boundary rules** (enforced by Biome `noRestrictedImports`/`noRestrictedGlobals` overrides on `apps/web/**`, plus review):
- No `fetch`, `XMLHttpRequest`, `WebSocket` or `EventSource` in `apps/web`.
- No imports from `@app/query`, `@app/api-client` or `@app/domain` in `apps/web`. The only allowed bridge into data is `@app/bridge` and the type-only exports of `@app/protocol`.
- React state is limited to **ephemeral UI state**: open/closed, focus, and uncommitted input drafts. Server-derived data, filtering, sorting, counts and derived values come from VMs.
- URL search params (react-router) are the source of filter state; routes pass them as `params` to `useView`.
- Route `loader`s only call `bridge.prefetch(viewKey, params)`, which sends a fire-and-forget command. They never fetch.
- Heavy or bulk work runs in the worker:
  - capture parsing
  - markdown parse, sanitize and render to a safe AST
  - dashboard aggregation
  - calendar grid building
  - history stage durations
  - attachment reading, size checks and hashing
  - upload streaming

## 7. MVP scope

**In:** workflows 1–12 in §1, with Web Push, rich text, realtime and search excluded. Also included:
- in-app notifications for all six kinds (DUE through the scheduler)
- light and dark themes
- a11y at WCAG 2.2 AA for core flows
- observability baseline
- CI builds versioned container images; deploying to a single-host compose stack (staging/prod are added when needed)

**Out (post-MVP backlog, epic E13):**
- Web Push with a service worker
- Rich-text docs (evaluated via ADR) and task embeds in docs
- SSE live updates
- Search and pagination UI
- CSV export
- SharedWorker multi-tab
- Offline cache (IndexedDB)
- Email digests
- Additional identity providers
- Audit log UI

## 8. JIRA-style backlog

The **global DoD** applies to every ticket:
- Acceptance criteria are met and demoed.
- Unit tests cover worker and domain logic (≥80% on `packages/*`).
- Components have RTL tests where there is interaction.
- A Playwright e2e test covers the story's happy path.
- Lint, typecheck and build are green.
- OpenAPI is updated and the contract test passes.
- No boundary-rule violations.
- a11y check (axe) passes.
- Docs and ADR are updated if a decision changed, and `docs/conversation/` is updated if scope changed.
- The PR is reviewed and merged via squash.

Complexity uses story points: S = 1–2, M = 3–5, L = 8, XL = 13. Priority is P0 (MVP-blocking), P1 (MVP), or P2 (post-MVP).

The format is **ID · Title · Priority · Complexity · Deps**, followed by the description, acceptance criteria (AC) and technical notes (TN). Tasks are listed as sub-bullets.

### E0 Foundations
- **E0-S1 · Repo bootstrap and tooling** · P0 · M · Deps: —
  - Description: create the pnpm monorepo with TS strict, Biome (the style of `fms-ui/biome.json`), Vite web app, Vitest, Playwright, husky and lint-staged, `.editorconfig`, `.nvmrc` (Node 24).
  - AC:
    - `pnpm i && pnpm dev` serves the app.
    - `pnpm check` runs lint, typecheck and test.
    - A pre-commit hook blocks commits to `main`.
  - TN: `pnpm-workspace.yaml`; each package has `tsconfig` project references.
  - Tasks:
    - T1: workspace and tsconfig base
    - T2: Biome config with the boundary overrides
    - T3: Vitest and Playwright configs
    - T4: husky and commit-msg lint (small in-house regex script, no commitlint)
    - T5: the pre-commit hook runs `node scripts/sync-agents.mjs --check` (ADR-0015)
- **E0-S2 · Agent and engineering docs** · P0 · M · Deps: E0-S1
  - Description: write `AGENTS.md`, create a `CLAUDE.md` symlink to it, add `.agents/rules/*` and `scripts/sync-agents.mjs` (ADR-0015), the `ADR/` template plus ADRs 0001–0015, and `docs/` (architecture, conventions, testing, git, DoD, local setup, conversation log).
  - AC:
    - Every rule in §10 exists.
    - `docs/conversation/2026-09-30-mvp-planning.md` captures this session.
- **E0-S3 · CI pipeline** · P0 · M · Deps: E0-S1
  - Description: GitHub Actions for lint, typecheck, test, build and e2e, plus `node scripts/sync-agents.mjs --check`. The OpenAPI breaking-change diff job is added once E2 exists.
  - AC:
    - PRs are gated on CI.
    - Build artifacts are cached.
- **E0-S5 · Design system foundations (Fluent 2–inspired)** · P0 · L · Deps: E0-S1
  - Description: build `@app/ui-kit`, our own design system that follows Fluent 2's principles but none of its code or brand assets (ADR-0014).
    - Two-layer tokens: global ramps, then semantic alias tokens such as `colorNeutralBackground1` and `colorBrandForeground1`.
    - Light, dark and high-contrast themes.
    - 4px spacing grid, type ramp, corner radii, elevation shadows, motion durations and easing curves, and focus-ring tokens.
  - AC:
    - Tokens ship as CSS custom properties with a TS token map.
    - A theme switch needs no re-render beyond the root attribute.
    - First primitives: Button, IconButton, Input, Textarea, Select, Checkbox, Field (label, hint, error), Dialog, Drawer, Menu, Tabs, Badge, Avatar, Tooltip, Toast, Spinner, Skeleton.
    - Every primitive is keyboard-accessible and meets WCAG 2.2 AA contrast.
    - A `/_design` route in dev shows every token and component.
  - TN:
    - System font stack (`Segoe UI` on Windows, falling back to system-ui), since Fluent's fonts aren't bundled.
    - Icons are an in-house SVG set.
    - No `@fluentui/*` dependency (ADR-0012).
  - Tasks:
    - T1: token pipeline (TS → CSS variables)
    - T2: themes, including high-contrast
    - T3: primitives, in batches by component family
    - T4: `/_design` gallery
    - T5: axe and keyboard tests
    - T6: extract the `add-ui-component` skill
- **E0-S4 · Local stack** · P0 · S · Deps: E2-S1
  - Description: a `docker-compose` with postgres, minio (S3) and the api, plus a fake-OIDC dev login behind `APP_ENV=dev`.
  - AC: `pnpm stack:up` gives a working login locally with no Google credentials.

### E1 Frontend data plane (worker, query, bridge)
- **E1-S1 · Protocol package** · P0 · M · Deps: E0-S1
  - Description: typed `ToWorker`/`ToMain` messages (command, rpc, push), error codes, and `ViewKey`/`ActionKey` type maps.
  - AC: exhaustive type tests; each message kind round-trips through structured-clone in tests.
  - TN: mirror `fms-ui` branch `packages/realtime/src/protocol.ts`.
- **E1-S2 · In-house query engine** · P0 · L · Deps: E1-S1
  - Description: the `@app/query` feature set described in §6.
  - AC: unit tests cover dedupe, TTL/GC, polling pause and resume, retry skipping 4xx, abort on force and on `clearAll`, optimistic mutation and rollback, and prefix invalidation.
  - TN: start from `fms-ui/packages/query/src/{query-cache,query-observer}.ts`. Fix the stale GC docs and the key-order hashing.
- **E1-S3 · API client in the worker** · P0 · M · Deps: E1-S1, E2-S2
  - Description: `fetch` with `credentials:'include'` and the CSRF header; problem+json becomes a typed `AppError`; decoders validate responses; a 401 emits a `session.expired` push.
  - AC:
    - Non-JSON errors fall back to `{title: statusText}`.
    - A 204 returns `undefined`.
    - Decode failures are reported with the path.
- **E1-S4 · Worker kernel and ViewRegistry** · P0 · L · Deps: E1-S2
  - Description: ref-counted view subscriptions, recompute on query change, push on structural change with microtask batching, `prefetch` command, visibility command, and `reset`.
  - AC: VM identity is stable when data is unchanged; unsubscribing stops polling.
  - Tasks: extract the `add-worker-view` skill (together with E1-S5).
- **E1-S5 · Bridge and React hooks** · P0 · M · Deps: E1-S4
  - Description: `createBridge(backend)`, `createWorkerBackend()` and `createInlineBackend()`, `useView`, `useAction`, and worker restart on crash.
  - AC:
    - Hooks are tested against the inline backend.
    - An RPC timeout gives `TIMEOUT`.
    - A worker crash gives a restart, then a fatal state.
- **E1-S6 · Boundary enforcement** · P0 · S · Deps: E1-S5
  - Description: Biome restricted imports and globals for `apps/web/**`, plus a CI script that greps for forbidden APIs.
  - AC: a PR that adds `fetch(` in `apps/web` fails CI.

### E2 Backend platform
- **E2-S1 · Service skeleton** · P0 · M · Deps: ADR-0003
  - Description: module layout, config, structured logging, request id, `/healthz` and `/readyz`, graceful shutdown, OTel.
  - AC: the container image runs; health checks pass.
- **E2-S2 · Contract-first API** · P0 · M · Deps: E2-S1
  - Description: `api/openapi.yaml` v0, server stub generation, TS types generation, problem+json error middleware.
  - AC: CI fails on a breaking change; every error returns `application/problem+json`.
- **E2-S3 · DB and migrations** · P0 · M · Deps: E2-S1
  - Description: the Postgres schema in §3, a migration tool, a seed script, and a tenant-scoped repository base.
  - AC: migrations are up/down tested; every query is scoped by `workspace_id` (enforced by a test).
  - Tasks: extract the `add-db-migration` skill.
- **E2-S4 · Outbox and dispatcher** · P1 · M · Deps: E2-S3
  - AC: an event is written in the same transaction; the dispatcher is idempotent; retries use backoff.
- **E2-S5 · Object storage and uploads** · P1 · M · Deps: E2-S3
  - Description: `POST /uploads` returns a presigned PUT; a confirm step checks size and MIME; downloads use a signed GET.
  - AC: limits of 5×5 MB per task and 20 MB per doc are enforced server-side.

### E3 Auth and workspaces
- **E3-S1 · Google OIDC login and sessions** · P0 · L · Deps: E2-S3
  - Description: `GET /auth/google/login` and the callback, `GET /auth/me`, `POST /auth/logout`, session cookie, CSRF check.
  - AC:
    - The `state`, `denied`, `oauth` and `internal` errors redirect to `/login?error=`.
    - Logout invalidates the server session.
- **E3-S2 · Login screen and session guard (web)** · P0 · M · Deps: E3-S1, E1-S5
  - Description: `session` view; the router guard sends users to `/login` or `/onboarding`; each error code has a message.
  - AC: an unauthenticated deep link returns to the target after login.
- **E3-S3 · Workspaces API** · P0 · M · Deps: E3-S1
  - Endpoints: `GET /workspaces`, `POST /workspaces` (name 1–100), `POST /workspaces/join`, `POST /workspaces/switch`, `GET /workspaces/current/members`, `POST /workspaces/current/invite-code/rotate`.
  - AC: an invalid invite code gives 404 problem+json; joining twice is idempotent.
  - Tasks: extract the `add-api-endpoint` skill (the first real module).
- **E3-S4 · Onboarding and workspace switcher (web)** · P0 · M · Deps: E3-S3
  - AC: switching runs worker `clearAll()` and aborts in-flight requests, and no stale data flashes.
- **E3-S5 · Workspace settings: invite code and members** · P1 · S · Deps: E3-S3
- **E3-S6 · Leave workspace, remove member, promote owner** · P1 · M · Deps: E3-S3, E4-S5, E5-S2
  - Description: implement the A7 lifecycle.
    - Endpoints: `POST /workspaces/current/leave`, `DELETE /workspaces/current/members/:userId` (owner only), `PATCH /workspaces/current/members/:userId {role}` (owner only).
  - AC:
    - The last owner can't leave or be removed; they get a 409 problem+json asking them to promote someone first.
    - A removed user's next request to that workspace gets 403, and the worker switches them to another workspace or to onboarding.
    - Their open assignments, ownerships and checklist assignments are removed, with history events.
    - Their pending requests are cancelled.
    - Their authored content shows "a former member".
    - Both flows ask for confirmation.
  - TN: the whole cleanup runs in one transaction and emits outbox events. Owners are prompted to rotate the invite code after removing someone.

### E4 Tasks core
- **E4-S1 · Tasks API CRUD and filters** · P0 · L · Deps: E2-S3, E3-S3
  - Endpoints: `GET /tasks` (status, mine, assigneeId, labelId, clientId, parentId), `GET/POST/PATCH/DELETE /tasks/:id`.
  - Validation: title is required; start and end dates are required on create; the end date must not be before the start date.
  - Other behavior: `version` field and ETag; `viewer` flags computed by policy.
  - AC: all validations return 422 problem+json with field `errors[]`.
- **E4-S2 · Task list view (worker VM and UI)** · P0 · L · Deps: E4-S1, E1-S5
  - Description: the `tasks.list` VM (filter chips from the URL, grouping by status, counters) with 15 s polling.
  - AC: filters live in the URL; the VM is computed in the worker; the list renders in under 16 ms per frame for 2k tasks (perf test).
  - Tasks: extract the `add-feature` skill (it chains the pattern skills), and the `write-e2e-test` skill if it doesn't exist yet.
- **E4-S3 · Task create** · P0 · M · Deps: E4-S2
  - Description: the `tasks.create` action; validators are shared through `@app/domain` and run in the worker.
  - AC: the reference's validation messages are shown; the list refreshes after create.
  - Tasks: extract the `add-worker-action` skill.
- **E4-S4 · Task detail drawer and manager edit** · P0 · L · Deps: E4-S3
  - Description: `?task=<id>` opens the drawer; the `tasks.detail` VM polls every 10 s; saving PATCHes only changed fields (diff computed in the worker); discard guard.
  - AC: a 409 conflict shows reload/merge options.
- **E4-S5 · Assignees, owners and labels** · P0 · M · Deps: E4-S4
  - Endpoints: `PUT /tasks/:id/assignees`, `PUT /tasks/:id/owners`, `PUT /tasks/:id/labels`.
  - AC: only `canManageOwners` can change owners; the creator is excluded from the owner list.
- **E4-S6 · Subtasks** · P1 · M · Deps: E4-S4
  - AC: subtask done/total counters are shown on the parent.
- **E4-S7 · Checklist** · P1 · M · Deps: E4-S4
  - Endpoints: `POST /tasks/:id/checklist`; `PATCH` and `DELETE /tasks/checklist/:itemId`.
  - Supports assigning items; optimistic toggle.
- **E4-S8 · Comments and mentions** · P1 · M · Deps: E4-S4
  - AC: the mention picker lists workspace members; a mention creates a MENTION notification (E9).
- **E4-S9 · Attachments** · P1 · M · Deps: E2-S5, E4-S4
  - Description: the worker reads the file, checks size, uploads with the presigned PUT and reports progress through push.
  - AC: messages for "X is larger than 5MB" and "Could not read attachments".

### E5 Permissions and change requests
- **E5-S1 · Task policy engine** · P0 · M · Deps: E4-S1
  - AC: a table-driven test covers the creator, owner, assignee and viewer roles against every mutation.
- **E5-S2 · Change-request API** · P0 · L · Deps: E5-S1
  - Endpoints: `POST /tasks/:id/requests` and `POST /tasks/requests/:rid/{approve,reject,cancel}`.
  - Behavior: the payload is typed per kind; approving applies the change through the domain command.
  - AC:
    - Only managers can approve or reject; only the requester can cancel.
    - Approving a stale request gives 409.
    - History events are written.
- **E5-S3 · Request mode UI** · P0 · L · Deps: E5-S2, E4-S4
  - Description: the VM exposes `editMode: manage|request|view` and per-field pending markers; the request dialog takes a note of at most 1000 chars; approve, reject and withdraw actions.
  - AC: the UI matches the reference behavior; each changed field produces one request.

### E6 History
- **E6-S1 · Events and status stages** · P1 · M · Deps: E4-S1
  - Endpoint: `GET /tasks/:id/history` returns `{events, stages}`.
  - AC: removed users are shown as "a former member".
- **E6-S2 · History tab** · P1 · M · Deps: E6-S1
  - Description: the worker formats events and computes time spent per status.

### E7 Dashboard and calendar
- **E7-S1 · Dashboard summary VM and UI** · P1 · M · Deps: E4-S2, E5-S2
  - Description: tiles, top-8 upcoming, review queue, counts by status and workload per member, all aggregated in the worker.
  - TN: add a `/dashboard/summary` server endpoint only if the worker can't keep up with more than 10k tasks (ADR).
- **E7-S2 · Calendar month VM and UI** · P1 · M · Deps: E4-S2
  - Description: the worker builds the grid with week start taken from the locale, plus the no-date list.

### E8 Clients and labels
- **E8-S1 · Clients API and UI** · P1 · M · Deps: E3-S3
  - Description: CRUD; the detail page shows linked tasks and docs; deleting unlinks them.
  - AC: 404 shows "Client not found".
- **E8-S2 · Labels API and settings UI** · P1 · S · Deps: E3-S3

### E9 Notifications (in-app)
- **E9-S1 · Notification generation** · P1 · M · Deps: E2-S4, E4-S8, E5-S2
  - Description: MENTION, ASSIGNED, STATUS, REQUEST and REVIEWED come from outbox consumers; DUE comes from a daily scheduler.
  - AC: users don't get notified of their own actions; per-kind settings are respected.
- **E9-S2 · Inbox UI** · P1 · M · Deps: E9-S1
  - Description: all/unread filter, mark one or all read, 20 s polling, unread badge, deep link to the task.
  - AC: a notification for a deleted task shows a graceful message.
- **E9-S3 · Notification settings** · P1 · S · Deps: E9-S1

### E10 Quick capture
- **E10-S1 · Capture parse and bulk create** · P1 · M · Deps: E4-S3
  - Description: the worker parser follows the reference's splitting rules; the user edits and removes lines, picks a source, then `POST /tasks/bulk` with an idempotency key.
  - AC: parser unit tests cover bullets, numbering and blank lines; a bulk failure is atomic.

### E11 Docs (markdown)
- **E11-S1 · Docs API** · P1 · M · Deps: E2-S5
  - Endpoints: CRUD, upload-as-doc (20 MB), attachments, client link.
- **E11-S2 · Docs list and editor** · P1 · L · Deps: E11-S1
  - Description: a textarea editor; the worker debounces autosave and renders markdown to a safe AST.
  - AC: XSS test corpus passes; there is a saving/saved indicator; the user is warned when leaving before a save finishes.

### E12 Hardening and release
- **E12-S1 · Observability** · P0 · M · Deps: E2-S1, E1-S5
  - Description: OTel dashboards and error reporting from the worker and main thread.
- **E12-S2 · Security review** · P0 · M · Deps: all P0 stories
  - Scope: CSP, rate limits, tenant-isolation tests, dependency audit, threat model.
- **E12-S3 · a11y and perf budgets** · P1 · M
  - Targets: axe checks in e2e, keyboard-only flows, main bundle under 150 KB gzipped, INP under 200 ms.
- **E12-S4 · Single-host deploy (compose) and release checklist** · P0 · M · Deps: E0-S3, E0-S4
  - Description: CI publishes versioned images. `deploy/compose.prod.yml` adds TLS through Caddy, a migrations one-shot container, nightly backups with a restore drill, and a release checklist. No cloud-provider services (ADR-0013).
  - Description: migrations job and release checklist.

### E13 Post-MVP (P2)
Web Push, SSE live updates, rich-text docs, task embeds in docs, search, pagination, export, SharedWorker, offline, email, extra identity providers, audit log UI.

## 9. Incremental roadmap (2-week sprints; each ends usable)

| Sprint | Milestone | Stories | Usable outcome |
|---|---|---|---|
| S0 | M0 Foundations | E0-S1..S3, E0-S5 (tokens + first primitives), E1-S1..S2, E2-S1..S3, ADRs | Repo, CI, contract v0; a worker "hello view" renders through the bridge |
| S1 | M1 Sign in | E0-S4, E1-S3..S6, E3-S1..S4 | Sign in, create or join a workspace, switch workspace |
| S2 | M2 Task tracker | E4-S1..S5, E5-S1, E8-S2 | Create, list, filter, edit and assign tasks with labels |
| S3 | M3 Collaboration | E4-S6..S9, E2-S5, E6, E8-S1 | Subtasks, checklist, comments, attachments, history, clients |
| S4 | M4 Governance | E5-S2..S3, E2-S4, E9 | Change requests, inbox, DUE reminders |
| S5 | M5 Insights and capture | E7, E10, E3-S5, E3-S6 | Dashboard, calendar, quick capture |
| S6 | M6 Docs and release | E11, E12 | Markdown docs; hardened single-host deploy ready for first users |

## 10. Agent, ADR and repository setup plan

**Existing guidance, reused rather than duplicated**
- `fms-ui/.cursor/` contains only `settings.json`. Project skills live in `fms-ui/.agents/skills/` (`fms-data-layer`, `fms-auth-api`, `web-feature-registry`). We **adapt the ideas** of `fms-data-layer` into our own `data-plane` rule. We don't copy it, because its store and observer model runs on the main thread.
- `demo-ui/.cursor/rules/frontend.mdc` has the 500-line component cap. We **reuse it verbatim** as `rules/file-size.mdc`.
- `demo-ui/.cursor/rules/backend-service-rule.mdc` is the Go conventions guide. We **reference and extend** it for `apps/api/**` by scoping it with `globs`, not `alwaysApply`. Its lock-free channel cache pattern is optional and adopted only through an ADR.
- `demo-ui/.cursor/rules/nemo-ui-*` and `skills/nemo-ui-theme` are **not adopted**, because this is a different product and the look is our own (Q1). We may borrow the density and token discipline.

**Files to create (at repo init, after approval)**
- `AGENTS.md` is the single source of truth, with `CLAUDE.md` symlinked to it. It covers:
  - the agentic workflow: understand, inspect, ADR, ticket, implement, test, review against AC, update docs, keep traceability
  - package boundaries
  - commands
  - DoD
  - "never fetch or transform in React"
  - PR and commit rules
- **Skills timing (decided 2026-09-30):** the process skills `ticket-workflow`, `write-adr` and `log-conversation` exist from day one. Each code-pattern skill is extracted by the ticket that produces the first real example of that pattern, and the Definition of Done requires this.
- **Agent-independent layout (ADR-0015).** Rules and skills are written once, in `.agents/`, and every tool reads the same content.
  - `.agents/rules/<name>.md`: frontmatter is `description` and an optional `paths:` glob list. No `paths` means the rule is always on.
    - Always on: `architecture-boundaries`, `file-size` (from demo-ui), `testing`, `adr`.
    - Scoped: `react-render-only` (`apps/web`, `ui-kit`), `data-plane-worker` (`packages/*`), `backend-go` (`apps/api`, extends demo-ui's rule).
  - `.agents/skills/<name>/SKILL.md`: the shared SKILL.md format. The first skill is `add-feature-view`: a recipe for a new feature from OpenAPI, through the API module, domain queries/actions/view model, ViewKey, and route and UI, to tests. It is added only once the pattern exists in S1.
  - `scripts/sync-agents.mjs`, an in-house script with no dependencies, generates the tool adapters:
    - `.claude/rules` and `.claude/skills`: symlinks into `.agents/`
    - `.cursor/skills`: symlink into `.agents/skills`
    - `.cursor/rules/*.mdc`: generated, with Cursor's `globs` and `alwaysApply`
    - a rules index table inside `AGENTS.md`, for tools without scoped rules, such as Codex
  - `--check` runs in CI and in the pre-commit hook.
- `ADR/0000-template.md` (Status, Context, Decision, Alternatives, Consequences, Links to tickets) and:

  | ADR | Decision |
  |---|---|
  | 0001 | Record architecture decisions |
  | 0002 | Modular monolith + contract-first OpenAPI |
  | 0003 | Backend language: Go |
  | 0004 | React 19 + Vite + react-router SPA |
  | 0005 | Worker-owned data plane; React render-only |
  | 0006 | In-house query engine (vs TanStack Query) |
  | 0007 | Main↔Worker protocol (command/rpc/push) |
  | 0008 | Cookie session + Google OIDC + CSRF strategy |
  | 0009 | Presigned uploads (vs base64 JSON) |
  | 0010 | Polling now, SSE later |
  | 0011 | Markdown docs in MVP |
  | 0012 | Minimal-dependency policy |
  | 0013 | Cloud-agnostic, single-host deployment (no cloud provider yet) |
  | 0014 | In-house design system modelled on Fluent 2 |
  | 0015 | Agent-independent rules and skills in `.agents/` |
  | 0016 | Sprint 0 dependency ledger |
  | 0017 | OIDC via go-oidc, plus a built-in dev identity provider |
  | 0018 | In-house OpenAPI → TS types and decoders |
  | 0019 | Protocol additions: VALIDATION, `resetData`, `skipAuthRedirect` |
- `docs/`:
  - `architecture.md`, with diagrams from §3 and §6
  - `conventions.md`: naming, files, error handling, VM naming `*.vm.ts`
  - `testing.md`: a pyramid of domain/query unit tests (Vitest, node env), bridge and hooks tests against the inline backend, RTL component tests, API tests against a real Postgres (testcontainers or compose), contract tests, and Playwright e2e per milestone
  - `git.md`: trunk-based, short-lived `feat/<ticket-id>-slug` branches, squash merge, protected `main`, and Conventional Commits `type(scope): subject [E4-S2]`. The PR template covers ticket link, AC checklist, screenshots, ADR impact and test evidence.
  - `definition-of-done.md`
  - `local-setup.md`
  - `backlog/`, one markdown file per epic with ticket blocks mirroring §8. These can be synced to JIRA later.
  - `conversation/2026-09-30-mvp-planning.md`, which records the original prompt, the user's note on react-router, the in-house query lib and the worker, the Q&A decisions D1–D4, the reference findings, and links to the ADRs. Each later session appends a dated entry.

## Verification (how we'll know the plan is executed correctly)

- **S0 exit:**
  - `pnpm check` is green in CI.
  - A Vitest suite for `@app/query` passes: dedupe, TTL, polling pause, retry, abort, optimistic rollback.
  - A Playwright smoke test loads the app and renders the `system.ping` VM from the worker. The e2e also asserts that no network request comes from the main thread, using a Playwright request listener to check that the initiator is the worker.
  - A CI job fails when `fetch(` is introduced in `apps/web`.
- **Per story:** the AC become Playwright specs against the compose stack (real API and Postgres, fake-OIDC). Parity checks compare our API responses with the reference's documented envelope and enum shapes.
- **Performance:** a Chrome trace with 2k tasks shows filtering and aggregation on the worker thread, with long tasks on the main thread under 50 ms.
