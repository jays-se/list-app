# ADR-0007: Main↔Worker protocol: command / rpc / push

- **Status:** Accepted
- **Date:** 2026-09-30
- **Tickets:** E1-S1, E1-S5

## Context
No functions can cross the worker boundary, and the boundary needs predictable error semantics. `@fms/realtime` (fms-ui branch `changes/karan-rohit`) has a proven design for this.

## Decision
There are three message kinds, typed in `@app/protocol`:
- **command** (main → worker): no reply, applied in the order sent. Used for subscribe/unsubscribe of a view, prefetch, visibility changes and reset.
- **rpc** (main → worker → main): gets exactly one reply. Timeouts are 10 s by default and longer for uploads. Error codes are `BAD_REQUEST | FAILED | TIMEOUT | WORKER_FAILED | HTTP_<status>`.
- **push** (worker → main): never awaited. Used for view updates, `session.expired`, upload progress and `fatal`.

Views are addressed by a `ViewKey` plus serializable params, and actions by an `ActionKey` plus args.

## Alternatives considered
- Comlink: an external library, and its proxy semantics hide costs.
- An ad-hoc `postMessage` scheme: untyped, and error handling ends up inconsistent.

## Consequences
- Easy to test through the inline backend.
- If the worker crashes, the bridge restarts it once, then shows the user a fatal state.
