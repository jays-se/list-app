# Database schema

The source of truth is the migrations in `resources/db/migrations/`. Update this file whenever a migration is added.

## Tenancy and RLS
- Workspace-scoped tables have `workspace_id` and row-level-security policies.
- Workspace-scoped queries run inside `db.WithTenant`, which sets `app.workspace_id` and `app.user_id` with `set_config(..., true)` for the current transaction only.
- Cross-workspace reads scoped to one user, such as "my workspaces", use `db.WithUser`.
- **The application DB role must be `NOSUPERUSER NOBYPASSRLS`.** Superusers bypass RLS. `TestTenantIsolation` checks the policies using such a role.

## Tables (migration 0001)

| Table | Purpose | Key columns |
|---|---|---|
| `users` | People who can sign in | `id uuid`, `email` (unique, case-insensitive), `name`, `image_url` |
| `workspaces` | Tenants | `id`, `name` (1–100 chars), `invite_code` (unique), `created_by → users` |
| `memberships` | User ↔ workspace, with role | PK `(workspace_id, user_id)`, `role IN ('OWNER','MEMBER')` (A7). **RLS:** a row is visible if it is in the current workspace or belongs to the current user; writes are allowed only into the current workspace. |
| `sessions` | Server-side sessions (ADR-0008) | `id_hash bytea` (SHA-256 of the cookie token), `user_id`, `active_workspace_id`, `expires_at`, `revoked_at` |
| `schema_migrations` | Migrator bookkeeping | `version`, `name`, `applied_at` |

Feature tables (tasks, requests, docs, clients, labels, notifications, outbox) arrive with their feature tickets. Each adds a numbered migration and a section here.
