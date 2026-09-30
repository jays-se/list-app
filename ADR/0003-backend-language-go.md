# ADR-0003: Backend language: Go

- **Status:** Accepted (confirmed by requester 2026-09-30)
- **Date:** 2026-09-30
- **Tickets:** E2-S1

## Context
The architecture itself does not depend on the language. Intellicar already has Go conventions, captured in `demo-ui/.cursor/rules/backend-service-rule.mdc`.

## Decision
- Use Go with the standard library `net/http` plus a minimal router, PostgreSQL through `pgx`, and a migration tool (to be chosen in E2-S3).
- Follow `.agents/rules/backend-go.md`, which is reused from demo-ui and scoped to `apps/api/**`.
- The lock-free channel cache pattern from that guide is optional and is adopted per module by its own ADR.

## Alternatives considered
- Node/TypeScript with Fastify: one language across the stack, but it breaks from the existing backend conventions.
- Kotlin/Spring: a heavier runtime, and nobody on the team uses it today.

## Consequences
- Two languages in the repo.
- Types are shared only through OpenAPI codegen, never by hand.
