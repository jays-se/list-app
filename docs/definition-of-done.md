# Definition of Done (global)

A ticket is done when:

- [ ] Its acceptance criteria are met and demoed.
- [ ] Worker and domain logic has unit tests, and `packages/*` coverage is at least 80%.
- [ ] Interactive components have Testing Library tests.
- [ ] A Playwright e2e test covers the happy path.
- [ ] Lint, typecheck and build pass.
- [ ] `api/openapi.yaml` is updated and the contract checks pass.
- [ ] It breaks no boundary rule: no fetch, transformation or data state in `apps/web`.
- [ ] The axe accessibility check passes, and the flow works with the keyboard alone.
- [ ] If this ticket introduced a new repeatable pattern, it is extracted into `.agents/skills/<name>/SKILL.md`.
- [ ] Docs and ADRs are updated when a decision changed.
- [ ] `docs/conversation/` has an entry when scope changed.
- [ ] The PR is reviewed, squash-merged, and its ticket status updated in `docs/backlog/`.
