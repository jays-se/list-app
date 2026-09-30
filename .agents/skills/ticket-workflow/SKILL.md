---
name: ticket-workflow
description: Implement a backlog ticket (E#-S#) end to end in this repo - read AC, branch, implement in increments, test, check the Definition of Done, update docs, and prepare the commit/PR. Use whenever the user says "do E4-S2", "start the next ticket", or "start sprint N".
---

# Ticket workflow

## 1. Understand
- Open the ticket in `docs/backlog/E<n>.md`. Read the description, acceptance criteria (AC), technical notes (TN) and dependencies.
- Check that each dependency is done: its status line reads `**Status:** Done`. If one isn't, stop and tell the user which dependency is blocking.
- Read the ADRs the ticket or its epic cites, and the rules that apply to the files you'll touch (see the rules index in `AGENTS.md`).

## 2. Inspect
- Find existing code to reuse: search `packages/*` and `apps/*`.
- Check `.agents/skills/` for a pattern skill that matches the work, such as `add-worker-view` or `add-api-endpoint`. If one exists, follow it.

## 3. Decide
- If the change adds a dependency, changes a boundary, protocol or data model, touches security, or reverses an ADR, use the `write-adr` skill **before** coding.

## 4. Plan and branch
- Branch: `feat/<ticket-id>-<slug>` (for example `feat/E4-S2-task-list`). Never work on `main`.
- Write the task breakdown into the PR description draft, using the T1..Tn list from the ticket plus anything you discovered.

## 5. Implement in increments
Each increment must compile and pass its tests before you start the next. Keep these hard rules in mind (`AGENTS.md`):
- React renders only.
- Data goes through the worker.
- Contract first: change `api/openapi.yaml` before the handlers.
- Files stay under 500 lines.
- UI uses `@app/ui-kit` tokens.

## 6. Test
- Follow `docs/testing.md` and pick the right layer. Use fake timers, never sleeps.
- Run `pnpm check`, which runs lint, typecheck, unit tests, the boundary check and the agents check.
- Run `cd apps/api && go test ./...` if the ticket touches the backend.
- Run `pnpm test:e2e` when the story has a user-facing happy path.

## 7. Review against the acceptance criteria
- Go through each AC and the checklist in `docs/definition-of-done.md`. Record the evidence for each item: a test name, a command output, or a screenshot.
- If the ticket introduced a **new repeatable pattern**, extract it into `.agents/skills/<name>/SKILL.md`. This is part of the Definition of Done.

## 8. Document
- Set the ticket's status line in `docs/backlog/E<n>.md`: `**Status:** Done (PR #…)`, or `In progress` with a list of what remains.
- Update `docs/` or the ADRs if anything changed.
- If the user changed scope or made a decision, use the `log-conversation` skill.
- If you changed `.agents/rules`, run `pnpm sync:agents`.

## 9. Commit and PR (only when the user asks)
- Commit message: `type(scope): subject [E4-S2]`. Types: feat, fix, perf, refactor, test, docs, chore, ci, build.
- PR body: ticket link, AC checklist with evidence, test evidence, screenshots for UI changes, ADR impact, and docs updated.
- End the report with an honest status: what is done, what was skipped or deferred, and what was not verified.
