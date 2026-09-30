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

## Migration 0002: auth identities (Sprint 1, ADR-0017)
- `users.auth_provider` and `users.auth_subject` are required. Together they are unique (`users_identity_key`), and they identify a user: `google` + the ID-token `sub`, or `dev` + email.
- `users.email` is no longer unique; it is profile data, indexed through `lower(email)`.
- `sessions_user_created_idx` supports "reactivate the last workspace I used" when a new session starts.

## Migration 0003: tasks and labels (Sprint 2)
| Table | Purpose | Key columns |
|---|---|---|
| `labels` | Workspace labels | `name` is 1–40 characters and unique per workspace, ignoring case. `color` is one of 9 palette keys. |
| `tasks` | Action items | `title` is 1–500 characters. `status` and `priority` are enums with CHECK constraints. `start_date` and `end_date` are required, with `end_date >= start_date`. `due_date` is optional. `version` is used for If-Match. |
| `task_assignees`, `task_owners` | People on a task | Primary key `(task_id, user_id)` |
| `task_labels` | Labels on a task | Primary key `(task_id, label_id)`. Rows cascade when a label is deleted. |

Every table has `workspace_id` and a `<table>_tenant` RLS policy (USING and WITH CHECK). Clients (`client_id`) and subtasks (`parent_id`) are added by their own migrations in Sprint 3.

Feature tables (requests, docs, clients, notifications, outbox) arrive with their feature tickets. Each adds a numbered migration and a section here.
