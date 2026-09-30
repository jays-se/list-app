# Security review and threat model (E12-S2)

Last reviewed: **2026-09-30**, Sprint 6. Baseline: OWASP ASVS L2. The decisions behind it are in ADR-0008, ADR-0017, ADR-0022 and ADR-0025.

## Assets
- Workspace data: tasks, docs, comments, files.
- Session cookies.
- Invite codes.
- Uploaded files.
- The Google OAuth client secret.
- The session-signing secret.

## Trust boundaries
```
Browser (main thread, render-only) ─postMessage─ Dedicated Worker ──HTTPS same-origin──► Caddy ─► API ─► Postgres (RLS)
                                                                                  └─► blob volume
```

## Threats and controls
| # | Threat | Controls | Verified by |
|---|---|---|---|
| T1 | **Cross-tenant data access** | Every workspace table has `FORCE ROW LEVEL SECURITY` keyed on `app.workspace_id`, set per transaction. The app role is not a superuser. Handlers never touch SQL. | `TestTenantIsolation` (db) and cross-workspace 404 checks in every flow test |
| T2 | **Session theft or fixation** | The cookie is an opaque id stored as a SHA-256 hash, marked `HttpOnly; Secure; SameSite=Lax`. It is rotated on sign-in and revoked on sign-out. | auth tests |
| T3 | **CSRF** | Unsafe `/api/*` requests need `X-Requested-With: app`, a same-site `Sec-Fetch-Site`, and a matching `Origin`. Only the dev provider's form and the signed blob routes are exempt. | `apiserver` CSRF tests, and the client-error 403 test |
| T4 | **XSS through docs, comments or titles** | React escapes all text. Markdown becomes a safe AST in the worker, so raw HTML stays text and links must be http(s) or mailto with no quotes or brackets. There is no `dangerouslySetInnerHTML`. A strict CSP (`script-src 'self'`) is the second layer. | The XSS corpus in `markdown.test.ts`, which found and fixed a quote left in an href during this review |
| T5 | **Privilege escalation inside a workspace** | One policy function decides every task permission (ADR-0020, ADR-0021). Owner-only actions return 403. The last owner can't be removed. | table-driven policy test, member lifecycle tests |
| T6 | **Malicious uploads** | Uploads are presigned PUTs with size limits (5 MB task files, 20 MB doc files). The size is checked again when the upload completes. Downloads send `Content-Disposition: attachment` and `nosniff`. Filenames are cleaned. | attachment and doc-file tests |
| T7 | **Brute force or abuse** (sign-in, bulk create, uploads, client errors) | Per-IP token buckets answer 429 with `Retry-After`. They are on in prod and counted in `rate_limited_total`. Invite codes carry at least 128 bits and can be rotated. | `ratelimit` tests |
| T8 | **Duplicate or replayed bulk writes** | A required `Idempotency-Key`, whose response is stored in the same transaction. | `TestBulkCapture` |
| T9 | **Secrets leaking** | Secrets come only from env or `deploy/.env` (git-ignored). Logs never include tokens. `/metrics` isn't proxied publicly and can require `METRICS_TOKEN`. | review |
| T10 | **Vulnerable dependencies** | Minimal dependencies (ADR-0012). CI runs `pnpm audit --prod` and `govulncheck`. | CI. The first run found GO-2026-5970 in `golang.org/x/text` v0.29.0 (pulled in by pgx); upgraded to v0.39.0 |
| T11 | **Clickjacking and MIME sniffing** | `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, and HSTS in prod. | headers |
| T12 | **Open redirects after sign-in** | `returnTo` accepts only same-origin paths. | auth tests |

## Accepted risks and follow-ups
- Rate limits live in memory, per instance. That is fine on a single host; move them to Redis or Postgres if we scale out.
- There are no per-doc permissions: any member can edit any doc, as in the reference app.
- The `idempotency_keys` table and stale PENDING uploads aren't pruned yet. A cleanup job is on the E12 backlog.
- Web Push, email and SSO providers beyond Google are post-MVP (E13).
