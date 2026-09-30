# 2026-09-30 · MVP planning session

**Participants:** product engineer (requester) and Claude Code (planning agent)
**Outcome:** the MVP plan was approved (`docs/mvp-plan.md`), and the repo docs, ADRs and agent rules were scaffolded. No application code has been written.

## 1. What was asked

The requester gave a planning brief:
- Use `https://list.intellicar.app/` **strictly as a functional/API reference**. Analyze its features, APIs, entities, states, validations, workflows and edge cases, and do **not** copy its UI, UX or visual design.
- Before writing any code, produce:
  1. Functional analysis
  2. Assumptions and questions
  3. High-level architecture
  4. Backend recommendations, kept language-independent at first
  5. A frontend options comparison
  6. A recommended stack
  7. MVP scope
  8. A JIRA-style backlog (Epic → Story → Task, with full ticket fields)
  9. A roadmap
  10. An agent, ADR and repo setup plan
- Inspect the existing `.cursor/` guidance and reuse it rather than duplicating it.
- Follow an agentic workflow: understand → inspect → ADR → tickets → implement → test → review → document → keep decisions traceable.

The requester added these constraints, in their words:
> "instead of depending on external libraries, use react router for routing and write inhouse query lib instead of tanstack query. And try to offload heavy computing task to web worker and use react only for rendering purpose, react codebase should not handle the query calls, data computation, data transformation, data state, if required take reference from /Users/jayshrivastava/CWF/fms-ui/packages. and keep documentation of our conversation"

## 2. What was discovered

- **What the reference app is:** a team task/docs/quick-capture tool, not a fleet or telematics product.
- **How the reference app works:**
  - Vite, React 19, react-router, TanStack Query, and Tiptap for the doc editor.
  - A same-origin `/api/v1` API with Google OAuth and a cookie session.
  - RFC 7807 problem+json errors.
  - Polling instead of websockets: every 15, 10 and 20 seconds depending on the screen.
  - The full functional analysis is in §1 of `docs/mvp-plan.md`.
- **`fms-ui/packages/query`:** an in-house `QueryCache` and `QueryObserver` library of about 1k lines of TypeScript, bound to React with `useSyncExternalStore`. It runs on the main thread and has no polling, retry, `select`, or optimistic helpers.
- **`fms-ui/packages/data-stores`:** a store class per feature, each extending `BaseCacheStore`, with HTTP injected as a dependency.
- **`@fms/realtime`:** exists only on the unmerged fms-ui branch `origin/changes/karan-rohit`. It is a Dedicated Worker with a `command | rpc | push` protocol, RPC timeouts, `WORKER_FAILED` handling, and an inline backend for tests. This is the model we follow for the worker boundary.
- **Existing `.cursor` guidance:**
  - `fms-ui/.cursor/` contains only `settings.json`; its skills live under `.agents/skills`.
  - `demo-ui/.cursor/` has a 500-line file rule, a Go backend guide and the nemo-ui theme skill.
  - What we reuse and why is in §10 of `docs/mvp-plan.md`.

## 3. Decisions made in this session

| # | Question | Decision | Recorded in |
|---|---|---|---|
| D1 | Where the product lives | A new repo, `CWF/list-app` (working name) | this repo |
| D2 | Backend ownership | We build our own backend, contract-first | ADR-0002, ADR-0003 |
| D3 | Frontend language | TypeScript strict | AGENTS.md |
| D4 | Docs editor | Markdown editor in the MVP, rich text after the MVP | ADR-0011 |
| — | Routing | react-router (data router) | ADR-0004 |
| — | Data layer | In-house query engine running in a Dedicated Worker; React only renders | ADR-0005, ADR-0006, ADR-0007 |
| — | Dependencies | Minimal-dependency policy | ADR-0012 |

## 4. Open questions carried forward

These are §2 of `docs/mvp-plan.md`:
- Q1: Do we adopt the nemo-ui visual tokens? Our recommendation is no; we define our own tokens.
- Q2: Which cloud? Our recommendation is GCP.
- Q3: Is Go the final backend language? It is proposed in ADR-0003.
- Q4: Are DUE reminders in the MVP? Our recommendation is yes.
- Q5: What retention and audit requirements apply, and how does a member get removed?

## 5. Next step

Sprint 0 (`docs/mvp-plan.md` §9) comes next. Its stories are E0-S1..S3, E1-S1..S2 and E2-S1..S3.

---
*Append a new dated file (`YYYY-MM-DD-<topic>.md`) for each later session that changes scope or decisions.*
