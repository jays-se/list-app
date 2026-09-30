# ADR-0020: Task permission policy

- **Status:** Superseded in part by ADR-0021 (workspace owners manage all tasks)
- **Date:** 2026-09-30
- **Tickets:** E5-S1, E4-S4, E4-S5, E5-S2, E5-S3

## Context
The reference app gives each task a `viewer {canManage, canManageOwners, isAssignee}` and three edit modes. It doesn't say whether workspace owners get extra rights on tasks. Permissions have to be enforced on the server; the UI only reflects them.

## Decision
There is one policy function, `tasksvc.Evaluate`, and `tasksvc.Authorize` applies it. It feeds both the API's `viewer` flags and the enforcement of every mutation. A table-driven test covers each role against each action.

| Who | View | Edit fields, assignees, labels, delete | Manage owners |
|---|---|---|---|
| Creator | ✓ | ✓ | ✓ |
| Task owner | ✓ | ✓ | ✗ |
| Assignee (not creator or owner) | ✓ | ✗, until change requests arrive (E5-S2) | ✗ |
| Any other workspace member | ✓ | ✗ | ✗ |

- **Workspace OWNER role:** it gets **no** extra task rights. Its extra powers are workspace settings: rotating the invite code and deleting labels.
- **The creator is never stored as an owner:** `PUT /owners` silently drops the creator's id.
- **Assignees and owners must be workspace members,** and labels must belong to the workspace. Either failure returns 422.
- **Concurrency:** `PATCH` requires `If-Match` with the task version. A missing header returns 428, and a stale one returns 409 with a user-safe message. Set replacements (`PUT`) are last-write-wins and bump the version.

## Alternatives considered
- **Workspace owners can edit any task.** This is simpler for admins, but it isn't what the reference does. It's easy to add later as one more row in `Evaluate`.
- **Assignees can edit status directly.** The reference routes their changes through requests; E5-S2 implements that.

## Consequences
- If the requester wants workspace owners to act as admins, this ADR is superseded and `Evaluate` gains one condition.
