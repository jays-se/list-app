# list-app (working name)

Team tasks, approvals, docs and quick capture.

- Start with `AGENTS.md`.
- Plan: `docs/mvp-plan.md`
- Ticket status: `docs/backlog/`
- Decisions: `ADR/`
- Session log: `docs/conversation/`

**Status:** Sprints 0–2 are complete: sign-in, workspaces, tasks (filters, drawers, owners, labels, conflict-safe edits) and the worker data plane. Next is Sprint 3: collaboration.

```sh
pnpm install && pnpm exec playwright install chromium
pnpm check
E2E_DATABASE_URL=postgres://… pnpm test:e2e
(cd apps/api && go test ./...)
```
