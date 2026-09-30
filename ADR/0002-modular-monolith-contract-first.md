# ADR-0002: Modular monolith with contract-first OpenAPI

- **Status:** Accepted
- **Date:** 2026-09-30
- **Tickets:** E2-S1, E2-S2, E2-S4

## Context
We are building our own backend (D2). The domain is cohesive: tasks, requests, docs, clients and notifications all share one workspace tenant. The team is small.

## Decision
- The backend is a single deployable modular monolith. It is split into modules (auth, workspace, task, request, history, doc, client, label, notification, capture), each layered handler → service → repository.
- `api/openapi.yaml` is the source of truth. Server stubs and TypeScript types are generated from it.
- Errors use RFC 7807 problem+json.
- Side effects go through a transactional outbox.
- The response envelopes `{tasks}` and `{task}` match the reference app, so parity is easy to check.

## Alternatives considered
- Microservices: too much operational cost for the MVP.
- GraphQL: adds a library and caching complexity inside the worker, with little gain at this scale.
- Code-first API: lets the contract drift from the implementation.

## Consequences
- CI runs an OpenAPI breaking-change diff.
- Modules can be split out later along the outbox boundaries.
