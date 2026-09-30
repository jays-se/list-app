# ADR-0021: Workspace owners can manage every task

- **Status:** Accepted (requester, 2026-09-30)
- **Date:** 2026-09-30
- **Supersedes:** ADR-0020 (only the "Workspace OWNER role" rule; everything else in ADR-0020 still stands)
- **Tickets:** E5-S1

## Context
ADR-0020 assumed workspace owners get no extra task rights, and asked the requester to confirm. The requester answered:
> "Yes workspace owner can edit any task"

## Decision
In `tasksvc.Evaluate`, a caller whose **workspace role is OWNER** gets `canManage` **and** `canManageOwners` on every task in that workspace. That lets them edit, assign, label, delete, and add or remove task owners, just like the creator. The workspace owner is not added to `owners[]`; the right comes from their role.

| Who | View | Edit / assignees / labels / delete | Manage owners |
|---|---|---|---|
| Workspace OWNER | ✓ | ✓ | ✓ |
| Creator | ✓ | ✓ | ✓ |
| Task owner | ✓ | ✓ | ✗ |
| Assignee, or any other member | ✓ | ✗ | ✗ |

## Consequences
- `Access` now includes the caller's workspace role, taken from `reqctx.Tenant.Role`, which `RequireWorkspace` has already verified.
- The table-driven policy test gains a "workspace owner" row.
