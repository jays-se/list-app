# ADR-0013: Cloud-agnostic, single-host deployment (no cloud provider yet)

- **Status:** Accepted
- **Date:** 2026-09-30
- **Tickets:** E0-S4, E2-S5, E12-S4

## Context
The requester asked, "Do we really need to use cloud services yet?" Nothing in the MVP needs a managed service. Everything runs on Postgres, S3-compatible storage and one Go binary. Committing to a cloud provider now would add cost, IAM setup and lock-in before the product has any users.

## Decision
- Use no managed cloud services during the MVP.
- One `docker compose` stack is the deployment unit, and the same stack runs in every environment:
  - `web`: Caddy serves the static build, reverse-proxies `/api` so everything stays same-origin, and handles TLS automatically.
  - `api`: the Go binary.
  - `db`: PostgreSQL 16.
  - `storage`: MinIO, which is S3-compatible.
  - `migrate`: a one-shot container that runs before the API starts.
  - `fake-oidc`: dev only.
- Where it runs:
  - A developer laptop, for now.
  - One Linux VM for staging or prod, added when there are external users.
- Ports and adapters keep the rest portable:
  - Storage uses the S3 API.
  - The database is standard Postgres.
  - Config comes from env vars.
  - Logs go to stdout as JSON, and traces use OpenTelemetry (OTLP).
- Backups are a nightly `pg_dump` plus a MinIO mirror. A restore drill is part of the release checklist.
- CI (GitHub Actions) builds versioned images and pushes them to GHCR (GitHub Container Registry). This is registry hosting, not a cloud runtime.

## Alternatives considered
- **GCP now** (Cloud Run, Cloud SQL, GCS). This would match the demo-ui CI, but it is too early: it brings cost and IAM work, and pre-product users don't need autoscaling.
- **Kubernetes.** Too much operational overhead for one service.

## Consequences
- There is no autoscaling and no managed HA. Both are acceptable for the MVP; we'll revisit when there are SLOs or real load.
- Moving to a cloud later means swapping the storage endpoint, DB host and runtime. No application code changes.
- The Google OAuth client still needs a Google Cloud *project* for credentials. That is identity configuration only and is not used for hosting.
