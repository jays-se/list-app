# Git, branching, commits, PRs

- **Trunk-based.** `main` is protected: no direct commits (enforced by a husky hook) and CI must be green.
- **Branches:** `feat/<ticket-id>-<slug>`, `fix/<ticket-id>-<slug>`, `chore/<slug>`, `docs/<slug>`. Keep branches short-lived (under 3 days).
- **Commits:** Conventional Commits, in the form `type(scope): subject [E4-S2]`.
  - Allowed types: feat, fix, perf, refactor, test, docs, chore, ci, build.
  - Scope is a package or feature, for example `query`, `bridge`, `tasks`, `api`.
- **PRs:** squash-merge. The PR template must cover:
  - ticket link
  - acceptance-criteria checklist
  - test evidence
  - screenshots (for UI changes)
  - ADR impact (none, or the new or updated ADR)
  - docs updated
- A PR changes one ticket. Stack PRs when a ticket is large.
