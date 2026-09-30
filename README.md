# list-app (working name)

Team tasks, approvals, docs and quick capture.

- Start with `AGENTS.md`.
- Plan: `docs/mvp-plan.md`
- Ticket status: `docs/backlog/`
- Decisions: `ADR/`
- Session log: `docs/conversation/`

**Status:** Sprints 0 and 1 are complete: sign-in, workspaces and invites, running end to end through the worker data plane. Next is Sprint 2: tasks.

```sh
pnpm install && pnpm exec playwright install chromium
pnpm check
E2E_DATABASE_URL=postgres://… pnpm test:e2e
(cd apps/api && go test ./...)
```
