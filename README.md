# list-app (working name)

Team tasks, approvals, docs and quick capture.

- Start with `AGENTS.md`.
- Plan: `docs/mvp-plan.md`
- Ticket status: `docs/backlog/`
- Decisions: `ADR/`
- Session log: `docs/conversation/`

**Status:** Sprints 0–3 are complete: sign-in, workspaces, tasks, clients, subtasks, checklist, comments, attachments and activity history, all through the worker data plane. Next is Sprint 4: change requests and notifications.

```sh
pnpm install && pnpm exec playwright install chromium
pnpm check
E2E_DATABASE_URL=postgres://… pnpm test:e2e
(cd apps/api && go test ./...)
```
