# ADR-0005: Worker-owned data plane; React is render-only

- **Status:** Accepted
- **Date:** 2026-09-30
- **Tickets:** E1-S1..S6

## Context
The requester asked that React code not handle query calls, data computation, transformation or data state. Their stated reason is to keep the main thread free for rendering.

## Decision
- A Dedicated Worker owns all network I/O, the query cache, domain state, view-model computation, validation and heavy transforms.
- React subscribes to view models with `useView` (`useSyncExternalStore` over a main-thread mirror) and triggers changes with `useAction`, which is an RPC.
- React may hold only ephemeral UI state (whether something is open, focus, input drafts).
- This is enforced by Biome `noRestrictedImports`/`noRestrictedGlobals` rules on `apps/web/**` and by a CI grep.

## Alternatives considered
- A main-thread query library, as in fms-ui `@fms/query`: this is what the requester explicitly ruled out.
- A SharedWorker: better for multiple tabs, but more complex to debug. Deferred until after the MVP.

## Consequences
- Every piece of data crosses `postMessage`, so view models must be structured-cloneable. Only changed view models are pushed.
- The inline backend runs the same kernel on the main thread, which lets tests run without a real Worker.
- Same-origin cookies work from a Dedicated Worker, so no tokens are exposed to JavaScript.
