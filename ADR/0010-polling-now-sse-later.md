# ADR-0010: Polling now, SSE later

- **Status:** Accepted
- **Date:** 2026-09-30
- **Tickets:** E1-S2, E13

## Context
The reference app polls: task lists every 15 s, a task's detail every 10 s, and the inbox every 20 s. Realtime updates are not an MVP requirement.

## Decision
- Use `refetchInterval` in `@app/query` at the reference app's rates.
- Pause polling when the page is hidden or nothing is subscribed.
- After the MVP, SSE push will invalidate query keys in the worker. The React API does not change.

## Alternatives considered
- WebSockets now: more infrastructure than the MVP needs.

## Consequences
- Updates can be up to about 15 s late.
- Moving to SSE later is contained inside the worker.
