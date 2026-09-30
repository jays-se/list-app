# Conversation log

This folder records the discussions that shaped the product, one dated file per session or topic. **When you add an entry, also add its row to this table**, newest last.

**Status values:**
- ✅ decided
- ⏳ pending the requester's answer
- ♻️ superseded (the row names what superseded it)

| # | Date | Topic | Requester asked | Outcome | Status | ADRs | Entry |
|---|---|---|---|---|---|---|---|
| 1 | 2026-09-30 | MVP planning | Plan an MVP using list.intellicar.app as a functional reference only. Use react-router, an in-house query library and a Web Worker data layer, with React used only for rendering. Document our conversations. | Functional analysis, architecture and a JIRA-style backlog. New repo `list-app`, our own backend, TypeScript strict, markdown docs in the MVP. | ✅ | 0001–0012 | [planning](2026-09-30-mvp-planning.md) |
| 2 | 2026-09-30 | Open questions resolved | Go for the backend; do we need cloud services yet?; our own design system referencing Fluent 2; DUE reminders; members can leave or be removed. | Go accepted. No cloud: a single-host docker compose. Fluent 2–inspired `@app/ui-kit` (E0-S5). DUE reminders in the MVP. Membership lifecycle (E3-S6). | ✅ | 0003, 0013, 0014 | [follow-up](2026-09-30-decisions-followup.md) |
| 3 | 2026-09-30 | Agent-independent rules | Why `.cursor`? Rules and skills must work in any agent tool, so they are written once. | `.agents/` is the only source. `scripts/sync-agents.mjs` generates the `.claude/` and `.cursor/` adapters and the `AGENTS.md` index. A `--check` runs in CI and pre-commit. | ✅ | 0015 | [agent rules](2026-09-30-agent-independent-rules.md) |
| 4 | 2026-09-30 | Skills timing | Add skills upfront or along the way? | 3 process skills now, code-pattern skills written by the ticket that creates each pattern, plus a Definition of Done line. Confirmed in #6. | ✅ | — | [skills + index](2026-09-30-skills-timing-and-log-index.md) |
| 5 | 2026-09-30 | Conversation overview | Keep an overview of conversations in a table. | This table. Updating it is part of workflow step 8. | ✅ | — | [skills + index](2026-09-30-skills-timing-and-log-index.md) |
| 6 | 2026-09-30 | Sprint 0 | "yes and start sprint 0" | Skills confirmed. Sprint 0 delivered: worker data plane, in-house query engine, bridge, ui-kit foundations, Go API skeleton, migrations with RLS, CI. 134 unit + 5 e2e + Go/Postgres tests pass locally. | ✅ | 0016 | [sprint 0](2026-09-30-sprint-0.md) |
| 7 | 2026-09-30 | Sprint 1 | "Start Sprint 1" | Sign-in (Google OIDC plus a dev provider, server sessions, CSRF), workspaces (create, join, switch, members, rotate) under RLS, OpenAPI codegen, compose stack, login, onboarding and settings UI. 161 unit + 9 e2e + Go/Postgres tests pass locally. | ✅ | 0017–0019 | [sprint 1](2026-09-30-sprint-1.md) |
| 8 | 2026-09-30 | Sprint 2 | "starts with sprint 2" | Tasks: API with filters, If-Match concurrency, a permission policy with owners, and labels; worker views and actions that diff saves; tasks UI with URL-driven filters, drawers, read-only mode and conflict recovery; ui-kit Drawer, Dialog and LabelChip. 228 unit + 11 e2e + Go/Postgres tests pass locally. | ✅ | 0020 | [sprint 2](2026-09-30-sprint-2.md) |
| 9 | 2026-09-30 | Owner rights; Sprint 3 | "Yes workspace owner can edit any task, and start sprint 3" | Workspace owners manage all tasks (ADR-0021). Clients, subtasks, checklist, comments with mentions, attachments over presigned blob storage (local + S3 drivers), activity history and time in status. 252 unit + 13 e2e + Go/Postgres tests pass locally. | ✅ | 0021, 0022 | [sprint 3](2026-09-30-sprint-3.md) |
| 10 | 2026-09-30 | CI coverage fix; Sprint 4 | "I have commited the changes to git, and start with sprint 4" | CI coverage gate fixed (`pnpm check` now runs coverage). Change requests (create, approve through the edit path, reject, withdraw, stale 409), transactional outbox + dispatcher, notifications (6 kinds, DUE scheduler, settings), request-mode UI and inbox. 287 unit + 14 e2e + Go/Postgres tests pass locally. | ✅ | 0023 | [sprint 4](2026-09-30-sprint-4.md) |
| 11 | 2026-09-30 | Run it locally; Sprint 5 | "Before starting with sprint 5, let's test the UI once, run the backend and frontend both…" then "continue with sprint 5, let the server and web running" | Dev stack running on :5180 and :8080 (`listapp_dev` database). Dashboard, calendar, quick capture (bulk and idempotent), member lifecycle (leave, remove, promote, cleanup), and the worker reacting to "removed from workspace". 303 unit + 16 e2e + Go/Postgres tests pass locally. | ✅ | 0024 | [sprint 5](2026-09-30-sprint-5.md) |

## Open items across conversations
| Item | Raised in | Status |
|---|---|---|
| Data retention periods and audit-log needs | #1, #2 | ⏳ open |
| Brand colour for the design system | #2 | ⏳ open (placeholder colour scale in use) |
| Confirm the skills approach | #4 | ✅ confirmed in #6 |
| Push to a GitHub remote so CI actually runs | #6 | ⏳ open (no remote yet) |
| Install Docker, or keep the portable-Postgres workflow for E0-S4 | #6, #7 | ⏳ open (compose written, not run) |
| Google OAuth client credentials for real sign-in | #7 | ⏳ open |
| Should workspace owners be able to edit any task? (ADR-0020) | #8 | ✅ yes, in #9 (ADR-0021) |
| Verify the S3 blob driver against a real S3/MinIO server | #9 | ⏳ open |
| `ATTACHMENT_ADD` change requests (staged uploads) | #10 | ⏳ deferred (ADR-0023) |
| DUE reminders use the UTC date; per-workspace time zones? | #10 | ⏳ open |
| Prune `idempotency_keys` and stale PENDING attachments (a scheduled job) | #11 | ⏳ E12 |
| Dashboard aggregates in the worker; add `/dashboard/summary` past about 10k tasks | #11 | ⏳ watch |
