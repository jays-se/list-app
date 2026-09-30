# ADR-0019: Protocol and context additions for sessions (Sprint 1)

- **Status:** Accepted
- **Date:** 2026-09-30
- **Tickets:** E1-S3, E3-S2, E3-S4
- **Extends:** ADR-0007

## Decision
1. **A `VALIDATION` error code.** Actions that fail client-side validation in the worker reject with `code: "VALIDATION"` and `fieldErrors`. Server 422 responses keep `HTTP_422`, and both carry `fieldErrors`, so the UI treats them the same way.
2. **`DomainContext.resetData()`.** Actions that change the tenant (workspace switch, create, join, logout) call it. It runs the kernel's `reset`: clear all queries, then resubscribe every live view. Actions must never call `client.clearAll()` directly, because that would orphan view subscriptions.
3. **`RequestOptions.skipAuthRedirect`.** The session probe (`GET /auth/me`) is expected to return 401 when signed out, so a 401 on it does not raise `session.expired`. Instead the `session.current` view reports `status: "anonymous"`.

## Consequences
- The bridge and hooks need no API change. `ProtocolError.code` simply gains one member.
