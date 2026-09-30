# ADR-0016: Sprint 0 dependency ledger (test tooling and Go libraries)

- **Status:** Accepted
- **Date:** 2026-09-30
- **Tickets:** E0-S1, E0-S5, E2-S1, E2-S3

## Context
ADR-0012 limits frontend runtime dependencies to `react`, `react-dom` and `react-router`, and it names the allowed dev tooling. Sprint 0 needed a few libraries beyond that list. This ADR records each one and why it is there, so the list stays auditable.

## Decision

**Frontend (dev and test only, never shipped to users):**

| Package | Why |
|---|---|
| `@axe-core/playwright` | Automated WCAG checks in e2e, which the Definition of Done requires. Writing our own would be unsafe. |
| `jsdom` | The DOM environment for Vitest component tests (part of the Vitest/Testing Library toolchain). |
| `@vitest/coverage-v8` | Enforces the ≥80% coverage gate. |
| `@testing-library/dom` | Peer dependency of `@testing-library/react`. |
| `@types/*` | Type definitions only. |

**Backend (Go):**

| Module | Scope | Why |
|---|---|---|
| `github.com/jackc/pgx/v5` | runtime | PostgreSQL driver and pool. Required by the Go rule (`.agents/rules/backend-go.md` §10). |
| `gopkg.in/yaml.v3` | test only | Reads `api/openapi.yaml` in the route↔contract test. |

We decided **not** to add these; the in-house version is used instead:

| Not added | Used instead |
|---|---|
| a router library such as chi | Go 1.22+ `net/http.ServeMux` patterns |
| a migration library | `internal/db/migrate.go`: embedded SQL, advisory lock, up/down |
| husky, lint-staged, commitlint | `.githooks/` shell scripts plus `core.hooksPath` |
| TanStack Query | `@app/query` (ADR-0006) |

## Alternatives considered
- **Hand-written a11y checks.** Rejected: incomplete and unmaintainable.
- **`chi`, which the demo-ui Go guide assumes.** Rejected: the standard-library mux now covers method and wildcard routing. We can revisit this if middleware grouping gets awkward.

## Consequences
- Any future dependency adds a row here or gets its own ADR.
- The Go module layout keeps to the `{module}mdl/svc/hdlr` convention without chi. Handlers register routes through `apiserver.Router.Handle`.
