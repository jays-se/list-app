# Release checklist and restore drill (E12-S4)

Deployment is one host running `deploy/compose.prod.yml` (ADR-0013, ADR-0025). CI publishes `ghcr.io/<repo>/api:<tag>` and `ghcr.io/<repo>/web:<tag>` for every `v*` tag.

## First-time setup
1. Get a Linux VM with Docker, and point DNS for `DOMAIN` at it. Open ports 80 and 443.
2. In Google Cloud, create an OAuth client (identity only). Set its redirect URI to `https://DOMAIN/api/v1/auth/google/callback`.
3. `cp deploy/.env.example deploy/.env` and fill it in. Generate `SESSION_SECRET` with `openssl rand -hex 32`, and use a long random `POSTGRES_PASSWORD`.
4. `docker compose -f deploy/compose.prod.yml --env-file deploy/.env up -d`. Caddy obtains TLS certificates automatically.

## Every release
- [ ] CI is green on `main`: web, api (including govulncheck), contract, e2e, and bundle budgets.
- [ ] The `api/openapi.yaml` diff has no breaking changes (the contract job).
- [ ] The conversation log, backlog statuses and ADRs are updated. Any new migration is described in `SCHEMA_DOC.md`, and its down migration has been tested.
- [ ] Tag the release: `git tag vX.Y.Z && git push --tags`, then wait for the image job.
- [ ] On the host, set `VERSION=vX.Y.Z` in `deploy/.env`.
- [ ] Take a backup before migrating: `docker compose -f deploy/compose.prod.yml exec backup sh -c 'pg_dump -h db -U list -d list -Fc -f /backups/pre-vX.Y.Z.dump'`.
- [ ] `docker compose -f deploy/compose.prod.yml --env-file deploy/.env up -d`. `migrate` runs first; the API starts only if it succeeds.
- [ ] Smoke test:
  - `curl -fsS https://DOMAIN/readyz` returns `ready`.
  - Sign in, open a task, and upload a file.
  - Check the inbox. A notification arrives within about a second (dispatcher).
- [ ] Watch for 15 minutes:
  - `http_requests_total{status=~"5.."}`, `outbox_pending_events`, `outbox_failed_events`, `client_errors_total`, `rate_limited_total`
  - logs: `docker compose logs -f api | grep -E '"level":"(ERROR|WARN)"'`
- **Rollback:** set `VERSION` back to the previous tag and run `up -d`. If the new migration isn't backward compatible, restore the pre-release dump (below) first.

## Restore drill (quarterly, and before the first public release)
1. Start a scratch database: `docker run -d --name drill -e POSTGRES_PASSWORD=x postgres:17`.
2. Copy the newest dump: `docker cp $(docker compose -f deploy/compose.prod.yml ps -q backup):/backups/<db-…>.dump /tmp/`.
3. Restore it: `docker cp /tmp/<db-…>.dump drill:/tmp/ && docker exec drill pg_restore -U postgres -d postgres --create /tmp/<db-…>.dump`.
4. Verify: row counts for `users`, `workspaces`, `tasks` and `docs` match production within the backup window, and `SELECT max(version) FROM schema_migrations` is the latest migration.
5. Restore blobs: `tar -xzf blobs-….tgz` into an empty volume, then open one attachment through a staging API.
6. Record the date, dump age and time taken in the table below, then remove the scratch container.

| Date | Dump age | Restore time | Result | By |
|---|---|---|---|---|
| — | — | — | not yet run (no production host yet) | — |

## Monitoring (without a cloud)
- Scrape `http://api:8080/metrics` with Prometheus on the host (or any agent), sending `Authorization: Bearer $METRICS_TOKEN` if one is set.
- Alert when:
  - the 5xx rate is above 1% for 5 minutes
  - `outbox_oldest_pending_seconds` is above 300
  - `outbox_failed_events` is above 0
  - `/readyz` fails
