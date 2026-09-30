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

## Migration 0004: collaboration (Sprint 3)
| Table / column | Purpose | Notes |
|---|---|---|
| `clients` | Clients linked to tasks (and later docs) | `name` is 1–100 characters; `color` uses the palette. Deleting a client sets `tasks.client_id` to NULL, so its tasks are unlinked, not deleted. |
| `tasks.client_id`, `tasks.parent_id` | Client link and subtasks | Subtasks are one level deep (enforced in the service). Deleting a parent deletes its subtasks. |
| `checklist_items` | Checklist items | `title` is 1–200 characters. `position` keeps the order. The assignee is optional. |
| `comments`, `comment_mentions` | Comments and @mentions | `author_id` is set to NULL if the user is deleted. The UI shows "A former member" when the author is no longer a member. |
| `attachments` | File metadata | `status` is PENDING or READY; `size` is at most 5 MB; `storage_key` is unique. The bytes live in blob storage (ADR-0022). |
| `task_events` | Append-only activity feed | Written in the same transaction as the change it records. |
| `task_status_stages` | Time in each status | At most one open stage per task (unique partial index). Existing tasks were backfilled. |

All tables have `workspace_id` and a `<table>_tenant` RLS policy.

## Migration 0005: requests, outbox, notifications (Sprint 4, ADR-0023)
| Table | Purpose | Notes |
|---|---|---|
| `change_requests` | Proposals by assignees | `kind` and `status` enums; `payload` jsonb (flat, per kind); `summary` is server text ("Change status to Done"); `note`/`review_note` ≤ 1000; `base_version` records the task version at request time. Cascades with the task. RLS. |
| `outbox` | Transactional outbox | **System table, no RLS**, never exposed to handlers. `available_at`/`attempts`/`last_error` drive retries; `processed_at` marks done. |
| `notifications` | In-app inbox | `UNIQUE (user_id, dedupe_key)` makes delivery idempotent. `task_id` is set to NULL on task delete; `task_title` keeps the title. RLS. |
| `notification_settings` | Per-user switches | `(user_id, kind)`; no row = enabled. User-scoped, not workspace-scoped. |

Feature tables for docs arrive with their feature tickets. Each adds a numbered migration and a section here.
