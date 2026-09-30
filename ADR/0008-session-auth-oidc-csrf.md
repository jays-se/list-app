# ADR-0008: Cookie session + Google OIDC + CSRF strategy

- **Status:** Accepted
- **Date:** 2026-09-30
- **Tickets:** E3-S1, E0-S4

## Context
The reference app uses Google OAuth with a cookie session. Because the worker sends all requests, tokens must never be readable by JavaScript.

## Decision
- Server-side Google OIDC using the authorization code flow with PKCE, with a signed `state` and `nonce`.
- The session is an opaque ID in an `HttpOnly; Secure; SameSite=Lax` cookie, with session rows stored server-side.
- CSRF protection on unsafe methods: check `Origin`/`Sec-Fetch-Site` and require the header `X-Requested-With: app`.
- In development, a fake OIDC provider runs behind `APP_ENV=dev`.

## Alternatives considered
- JWT kept in localStorage: exposed to XSS.
- Bearer token held in the worker: easier to steal and harder to revoke.

## Consequences
- The API and web app are same-origin, via a reverse proxy.
- Logout revokes the session on the server.
