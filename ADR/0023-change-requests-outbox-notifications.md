# ADR-0023: Change requests, the transactional outbox, and notifications

- **Status:** Accepted
- **Date:** 2026-09-30
- **Tickets:** E5-S2, E5-S3, E2-S4, E9-S1, E9-S2, E9-S3

## Context
The reference app gives each task three modes: *manage*, *request* (assignees who can't manage) and *view*. Requests are approved or rejected by managers and can be withdrawn by the requester. It sends in-app notifications of six kinds: MENTION, ASSIGNED, STATUS, DUE, REQUEST, REVIEWED. Side effects must not be lost if the process dies right after a commit, and they must not run if the change rolls back.

## Decision

### Change requests
- `viewer.canRequest` is true when the caller is an assignee who can't manage the task (ADR-0020, ADR-0021).
- Supported kinds:
  - `UPDATE`: only `status`, `startDate`, `endDate` and `dueDate`, which is the reference app's limit for assignees
  - `ASSIGNEE_ADD` and `ASSIGNEE_REMOVE`
  - `SUBTASK_ADD`
  - `CHECKLIST_ADD`, `CHECKLIST_UPDATE` and `CHECKLIST_REMOVE`
  - `ATTACHMENT_REMOVE`
- `ATTACHMENT_ADD` is **deferred**: it needs staged uploads that aren't attached until approval.
- The payload is validated per kind when the request is created. An optional note is at most 1000 characters.
- **Approve** runs under the reviewer, who must have `canManage`, in **one transaction**:
  1. Lock the request and check it is `PENDING`.
  2. Apply the change through the same internal functions a manager's direct edit uses, so validation, history events and outbox events are the same.
  3. Mark the request `APPROVED`.
  4. Write the `REQUEST_APPROVED` history event.
- **Stale means the request's precondition no longer holds**, not "any version change". When a request is filed, `UPDATE` records the field's current value as `from`; approval returns 409 `request_stale` if that field has changed since. Other kinds are stale when their target is gone or already in the requested state (item deleted, person already assigned), or when applying the change would now fail validation. `base_version` is kept for audit. A whole-task version check would reject nearly every approval, because comments and other fields change all the time.
- **Payload is one flat object**, with the members each kind needs, e.g. `{field, value, from}`, `{userId}`, `{itemId, done}`. The server validates it per kind. We didn't use a `oneOf` per kind, because our in-house generator (ADR-0018) doesn't support discriminated unions and a flat shape stays clear.
- **`summary` is English text written by the server** (e.g. "Change status to Done"). History, notifications and the UI all show this same sentence.
- A duplicate request (same requester, kind and target still pending) returns 409 `request_duplicate`.
- Approving `SUBTASK_ADD` creates the subtask as the reviewer, using the parent's dates, and assigns it to the requester if they are still a member.
- **Reject** is for managers and takes an optional note. **Cancel** is only for the requester and shows as "Withdrawn".
- Routes are `/api/v1/requests/{id}/{approve|reject|cancel}`, for the same ServeMux reason as `/attachments`.

### Outbox (E2-S4)
- Domain services insert `outbox` rows `(kind, payload)` inside the transaction that makes the change.
- A dispatcher goroutine loops over these steps:
  1. Claim a batch with `FOR UPDATE SKIP LOCKED`, which is safe with several instances.
  2. Run the handler for each row in the same transaction.
  3. Mark the row processed.
- On failure the dispatcher increments `attempts`, records `last_error` and sets `available_at` with exponential backoff (maximum 1 hour). After 10 attempts the row is left for an operator.
- `outbox` is a **system table without RLS**. It is never exposed to request handlers; the dispatcher sets the tenant context per row when it writes notifications.
- Notifications carry a unique `dedupe_key`, so re-processing a row is harmless (idempotent).

### Notifications (E9)
Who gets notified. The actor never notifies themselves.

| Kind | Recipients |
|---|---|
| ASSIGNED | Newly added assignees |
| STATUS | The task's creator, owners and assignees |
| MENTION | The mentioned members |
| REQUEST | The task's creator and owners |
| REVIEWED | The requester |
| DUE | Assignees, or the creator if nobody is assigned |

- **DUE:** an hourly scheduler finds tasks due **tomorrow (UTC date)** that aren't DONE or CANCELED. The dedupe key `due:{task}:{date}` means each person gets one notification per due date.
- **Settings:** stored per user and per kind as `enabled`, with a default of enabled. They control in-app delivery now; the reference app's per-kind push switch arrives with Web Push after the MVP (E13).
- **Inbox:** scoped to the active workspace. The API supports `unread`, mark-read and read-all. If the task has been deleted, the notification's task is null and the UI says so.

## Consequences
- Notifications arrive within about a second (dispatch interval) of the change.
- Tests call `Dispatcher.RunOnce` and `DueScheduler.RunOnce(now)` directly.
- The dispatcher runs in every API instance, and `SKIP LOCKED` keeps instances from processing the same row twice.
