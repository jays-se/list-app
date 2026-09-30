# ADR-0017: OIDC via go-oidc, plus a built-in dev identity provider

- **Status:** Accepted
- **Date:** 2026-09-30
- **Tickets:** E3-S1, E0-S4
- **Refines:** ADR-0008

## Context
ADR-0008 settled server-side Google OIDC (authorization code + PKCE) with an opaque session cookie. Two questions were left open:
1. Verifying an ID token means JWKS fetching, key rotation, and checking signature, `iss`, `aud`, `exp` and `nonce`. Getting any of these wrong is a critical security bug.
2. Local development and e2e tests must not need Google credentials or a network connection. The plan (E0-S4) called for a "fake OIDC" dependency.

## Decision
- **Google:**
  - Use `github.com/coreos/go-oidc/v3` for discovery, JWKS and ID-token verification, and `golang.org/x/oauth2` for the code exchange with PKCE (S256).
  - Check `nonce` against the value stored in the flow cookie.
  - Require `email_verified == true`.
  - Identify users by `(provider, subject)`, never by email.
- **Dev provider:** built into the API. When `AUTH_PROVIDER=dev` (allowed only if `APP_ENV` is `dev` or `test`):
  - `GET /api/v1/auth/dev/authorize` shows a minimal form (name and email).
  - Submitting it redirects to the normal callback with a short-lived, HMAC-signed code.
  - The rest of the flow (state, nonce, session, error redirects) runs the same code as Google.
  - Config fails at startup if `AUTH_PROVIDER=dev` with `APP_ENV=prod`, and the dev routes are not registered in prod.
- **Flow state:** a signed, `HttpOnly`, `SameSite=Lax` cookie `oauth_flow` holds `{state, nonce, PKCE verifier, returnTo, expiresAt}`. It is scoped to `/api/v1/auth` and lasts 10 minutes. `returnTo` must be a same-site path: it starts with `/` and not `//`.
- **Sessions:** 32 random bytes, sent as the `sid` cookie (`HttpOnly`, `SameSite=Lax`, `Secure` unless dev over HTTP). Only the SHA-256 hash is stored in `sessions`. Default lifetime is 30 days. Logout revokes the row.

## Alternatives considered
- **A hand-written JWT/JWKS verifier.** Too risky.
- **A separate fake-OIDC container** (for example, mock-oauth2-server). Docker isn't available on dev machines yet (open item), and it adds a moving part. The built-in provider covers the same flow.
- **Stateless JWT sessions.** Rejected by ADR-0008, because they can't be revoked.

## Consequences
- Adds two well-maintained Go modules (recorded in the ADR-0016 ledger).
- The Google path can't be tested end-to-end without real credentials. A unit test runs it against an in-process OIDC server that issues RS256 tokens, which covers discovery, JWKS, nonce and audience.
- Production needs `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_BASE_URL` and `SESSION_SECRET`.
