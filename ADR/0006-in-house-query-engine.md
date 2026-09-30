# ADR-0006: In-house query engine instead of TanStack Query

- **Status:** Accepted
- **Date:** 2026-09-30
- **Tickets:** E1-S2

## Context
The requester chose to avoid external libraries. `fms-ui/packages/query` already proves the pattern in about 1k lines of TypeScript. TanStack Query is built around React hooks, which is a poor fit for running inside a worker.

## Decision
- Build `@app/query`, framework-free and running in the worker, starting from the fms-ui `QueryCache`/`QueryObserver` design.
- Carry over: prefix-matched keys, request deduplication, `ttl`/`gcTime`, and cancellation with `AbortController`.
- Add:
  - stable hashing of keys with sorted object keys
  - `refetchInterval` polling that pauses when the page is hidden or nothing is subscribed
  - exponential-backoff retry that skips 4xx responses
  - optimistic mutations with rollback and declared invalidations
  - `clearAll()`, used on workspace switch

## Alternatives considered
- TanStack Query, whose core can run without React: an external dependency the requester ruled out, and more features than we need.
- Plain fetches with no cache: would duplicate requests and give no polling or invalidation model.

## Consequences
- We own the maintenance, so test coverage must be at least 80%.
- The feature set is limited to what we actually need.
