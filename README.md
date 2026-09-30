# list-app (working name)

Team tasks, approvals, docs and quick capture.

- Start with `AGENTS.md`.
- Plan: `docs/mvp-plan.md`
- Ticket status: `docs/backlog/`
- Decisions: `ADR/`
- Session log: `docs/conversation/`

**Status:** Sprint 0 is complete. The data plane runs end to end: the Go API is called only by the Web Worker, and React renders the result. Next is Sprint 1: sign-in and workspaces.

```sh
pnpm install && pnpm exec playwright install chromium
pnpm check && pnpm test:e2e
(cd apps/api && go test ./...)
```
