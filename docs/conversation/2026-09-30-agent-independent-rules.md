# 2026-09-30 · Agent-independent rules and skills

## What the requester asked
> "why should we name it .cursor, should it be in .agent folder?"
> "we should agent independent rules, skills and all, so that If I code using claude, cursor, I dont need to write rules and skills again and again"

## What we checked
We checked the current Claude Code docs. Claude Code:
- supports `.claude/rules/*.md` scoped with `paths:`, and loads rules that have no `paths` unconditionally;
- follows symlinks in `.claude/rules` and `.claude/skills`;
- reads `AGENTS.md` natively.

Cursor reads `.cursor/rules/*.mdc` (`globs`, `alwaysApply`) and `.cursor/skills`. We have not verified whether Cursor follows symlinked `.mdc` files, so its rule files are generated rather than symlinked.

## Decision
The decision is ADR-0015:
- Rules and skills are written once, in `.agents/`.
- `scripts/sync-agents.mjs`, an in-house script with no dependencies, creates the `.claude` symlinks and the `.cursor` symlinks and generated `.mdc` files. It also writes a rules index into `AGENTS.md`.
- `--check` runs in CI and pre-commit so the generated files can't drift from the source.

## Files changed
- The old `.cursor/rules/*.mdc` sources moved to `.agents/rules/*.md`.
- New files: `.agents/README.md`, `scripts/sync-agents.mjs`, `ADR/0015`.
- Updated: `AGENTS.md`, `docs/mvp-plan.md` §6 and §10, `docs/backlog/E0.md`, `ADR/0003`, `docs/conventions.md`.
