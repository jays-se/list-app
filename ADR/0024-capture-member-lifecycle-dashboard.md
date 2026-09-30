# ADR-0024: Quick capture, member lifecycle, dashboard and calendar

- **Status:** Accepted
- **Date:** 2026-09-30
- **Tickets:** E10-S1, E3-S6, E7-S1, E7-S2

## Context
Sprint 5 adds four features:
- turning pasted notes into tasks in bulk
- the workspace membership lifecycle: leave, remove, promote
- the dashboard
- the calendar

Three things need a decision:
- how bulk create stays atomic and safe to retry
- how removing a member cleans up everything tied to them
- where the dashboard's numbers are computed

## Decision

### Quick capture (E10-S1)
- **Parsing runs in the worker** (`capture.parse`):
  1. Split the pasted text on newlines.
  2. Strip leading bullets `- * •` and numbering like `1.` or `1)`.
  3. Trim each line and drop the empty ones.
  4. Keep at most 100 lines. The parser flags any line over 500 characters instead of cutting it.
- **Creating:** `POST /api/v1/tasks/bulk` with `{source, startDate, endDate, titles[]}` and a required `Idempotency-Key` header.
  - Every title is created in **one transaction**. If any title is invalid, nothing is created and the 422 names the failing index (`titles[3]`).
  - `source` is `MEETING_NOTE` or `PERSONAL` and is stored on each task (`tasks.source`). **PERSONAL tasks are assigned to the creator**; meeting-note tasks start unassigned.
- **Idempotency:**
  - `idempotency_keys` stores `(user_id, key)`, a hash of the request, and the response, in the same transaction that creates the tasks.
  - A replay of the same request returns the stored response.
  - The same key with a different body returns 422.
  - A concurrent duplicate waits on the unique index, then replays the stored response.
  - The worker generates the key once per parsed batch (`batchId`), so retrying a submit reuses it.

### Member lifecycle (E3-S6)
- **Endpoints:**
  - `POST /workspaces/current/leave`
  - `DELETE /workspaces/current/members/{userId}` (owner only)
  - `PATCH /workspaces/current/members/{userId}` with `{role}` (owner only)
- **The last owner can't leave, be removed, or be demoted.** The API returns 409 `last_owner`.
- **Cleanup runs in one transaction with the membership delete**, through `tasksvc.RemoveMemberTx`, which the workspace service calls through an interface, so there is no import cycle:
  - the person's assignee and task-owner rows are removed, each with a history event
  - their checklist assignments are cleared
  - their pending requests are cancelled
  - authored content remains and shows "a former member", as it already does
- **After the commit**, the removed person's sessions that pointed at the workspace move to their most recently joined other workspace, or to none.
  - Their next workspace request gets 409 `no_active_workspace`, as it already did.
  - **The worker now treats that 409 as a tenant change** and calls `resetData`, so the session guard shows their new workspace or onboarding.

### Dashboard and calendar (E7)
- **Computed in the worker** from the tasks list and members queries that already exist; no server endpoint yet (per the E7-S1 technical note).
- `TaskSummary` gains `viewer` and `source`, so the review queue can list pending requests on tasks the caller manages.
- **Calendar:**
  - The week starts on the day the locale gives (`Intl.Locale#getWeekInfo`), falling back to Monday, or Sunday for `en-US`.
  - Tasks are placed by `dueDate`.
  - Open tasks without a due date are listed next to the grid.

## Consequences
- Bulk create is all-or-nothing and safe to retry.
- Removing a member leaves no dangling assignments, and history explains each change.
- The dashboard costs nothing on the server. If workspaces grow past about 10k tasks, add `/dashboard/summary` behind the same view (E7-S1 technical note).
