# ADR-0025: Docs model; observability and hardening without new dependencies

- **Status:** Accepted
- **Date:** 2026-09-30
- **Tickets:** E11-S1, E11-S2, E12-S1, E12-S2, E12-S3, E12-S4

## Context
Sprint 6 finishes the MVP. It adds markdown docs (ADR-0011) and hardens the release: observability, security, budgets and a production compose stack. Two constraints apply: the minimal-dependency policy (ADR-0012), and no cloud services (ADR-0013).

## Decision

### Docs (E11)
- **Model:** a `docs` row holds a title (1–200 characters), a markdown `content` string (at most 200,000 characters), an optional `client_id`, and a `version`.
  - `PATCH` needs `If-Match`, and a stale version returns 409, as for tasks.
  - Files attached to a doc live in `doc_files`, separate from task attachments (at most 10 files, each at most **20 MB**). They reuse `blobstore` presigned uploads (ADR-0022).
- **Permissions:** any member can read, create and edit any doc; the reference app has no per-doc sharing. Only the creator or a workspace OWNER can delete a doc.
- **Upload as a doc:** handled in the worker.
  - A `.md` or `.txt` file of at most 1 MB becomes the doc's content.
  - Any other file (at most 20 MB) creates a doc titled after the file, with the file attached.
  - No extra endpoint is needed.
- **Markdown to a safe AST, in the worker** (ADR-0011):
  - A small in-house parser supports headings, paragraphs, bullet and numbered lists (nesting by indentation), blockquotes, fenced code, horizontal rules, and inline strong, emphasis, strikethrough, code and links.
  - Raw HTML is always text.
  - Links are allowed only for `http:`, `https:` and `mailto:`; anything else renders as plain text.
  - Images render as links.
  - React renders the AST with elements, so there is no `dangerouslySetInnerHTML`.
  - An XSS corpus test locks this in.
- **Autosave in the worker:**
  - `docs.edit` stores the draft in a local query and debounces the `PATCH` (800 ms).
  - The view exposes `saveState` (`saved`, `saving`, `unsaved`, `error` or `conflict`).
  - The page warns before leaving unless the doc is saved.

### Observability (E12-S1)
- **We're not adopting the OpenTelemetry SDK yet.** It is about 40 modules for traces we can't view yet, because there's no collector without a cloud service or an extra container.
- `internal/metrics` exposes Prometheus text format at `GET /metrics` on the API port. Caddy doesn't proxy `/metrics`, so it isn't public. Metrics:
  - request count and duration histogram, by route pattern and status
  - outbox backlog and oldest-event age
  - client errors
- Client errors (worker and main thread) go through the worker to `POST /api/v1/client-errors`, a rate-limited endpoint that logs `client_error` with the request id.
- OTel stays the target once a collector exists; the metrics names stay compatible with it.

### Security (E12-S2)
- **Rate limits:** an in-house token bucket per client IP and route group, answering 429 with `Retry-After`. It covers sign-in, bulk create, uploads and client errors.
- **Headers and review:**
  - The SPA's CSP is already strict, in Caddy.
  - The API keeps `nosniff`, `DENY` and `no-store`.
  - `docs/security.md` records the threat model and review.
  - CI runs `govulncheck` and `pnpm audit --prod`.

### Budgets and deploy (E12-S3, E12-S4)
- `scripts/check-bundle.mjs` fails the build when the entry JS exceeds **150 KB gzipped**.
- `deploy/compose.prod.yml` sets up:
  - Caddy with automatic TLS
  - versioned GHCR images
  - a one-shot `migrate` container
  - a nightly `pg_dump` with 14-day retention
  - the MinIO bucket on a volume
- `docs/release.md` holds the release checklist and restore drill.

## Consequences
- The MVP now has all its features, and the dependency ledger is unchanged.
- We don't get traces until a collector exists; logs carry the request id instead.
