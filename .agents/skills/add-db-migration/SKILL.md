---
name: add-db-migration
description: Add a PostgreSQL schema change for apps/api as a numbered up/down migration with RLS for workspace-scoped tables, update SCHEMA_DOC.md, and test it. Use for any new table, column, index or policy.
---

# Add a DB migration

Reference implementation: `apps/api/resources/db/migrations/0001_identity_tenancy.*`. It is tested by `apps/api/internal/db/db_test.go`.

## Steps
1. **Name it** with the next contiguous number: `resources/db/migrations/NNNN_snake_name.up.sql` plus a matching `.down.sql`. The loader rejects gaps, missing downs and bad names.
2. **Write the up migration:**
   - Use `uuid` PKs with `DEFAULT gen_random_uuid()`, and `timestamptz` for `created_at` / `updated_at`.
   - Add `CHECK` constraints for validation that also exists in the API. For example, the name length is 1–100.
   - **Workspace-scoped tables** need all of the following:
     - `workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`
     - an index that leads with `workspace_id`
     - `ENABLE` and `FORCE ROW LEVEL SECURITY`, plus a policy on
       `nullif(current_setting('app.workspace_id', true), '')::uuid`
   - Optimistic concurrency, for editable aggregates: `version integer NOT NULL DEFAULT 1`.
   - The whole file runs in one transaction. Don't use `CREATE INDEX CONCURRENTLY`; if you ever need it, write a separate migration and document why.
3. **Write the down migration.** It must fully reverse the up, dropping in reverse dependency order.
4. **Use it from Go.** Services run workspace-scoped queries only inside `db.WithTenant(ctx, pool, tenant, fn)`. Handlers never touch the DB.
5. **Document it** by adding the table or columns to `apps/api/docs/SCHEMA_DOC.md`.
6. **Test it:**
   - `TestMigrateUpDownUp` covers every migration automatically.
   - For each new RLS policy, add a case in the style of `TestTenantIsolation`, using a `NOSUPERUSER NOBYPASSRLS` role, because superusers bypass RLS.
   - Run it with `TEST_DATABASE_URL=postgres://… go test ./internal/db/`. CI provides Postgres 17.
7. **Check it locally:**
   - `DATABASE_URL=… go run ./cmd/api migrate up`
   - `DATABASE_URL=… go run ./cmd/api migrate down 1`
   - `DATABASE_URL=… go run ./cmd/api migrate up`
