# ADR-0015: Agent-independent rules and skills in `.agents/`

- **Status:** Accepted
- **Date:** 2026-09-30
- **Tickets:** E0-S2, E0-S3

## Context
The requester codes with more than one AI tool, including Claude Code and Cursor, and does not want to write rules and skills separately for each one. Each tool looks in a different place:
- Cursor reads `.cursor/rules/*.mdc`, using the `globs` and `alwaysApply` fields.
- Claude Code reads `.claude/rules/*.md`, using the `paths` field. It follows symlinks and reads `AGENTS.md` natively.
- Both read `SKILL.md` skills, but from different folders.
- Codex and similar tools read only `AGENTS.md`.

fms-ui already keeps skills in `.agents/skills/`.

## Decision
- **One source of truth:** `.agents/`.
  - Rules: `.agents/rules/<name>.md`. The frontmatter has `description` and an optional `paths:` YAML list of globs. With no `paths`, the rule is always on. Don't use brace globs such as `{ts,tsx}`; list each pattern separately.
  - Skills: `.agents/skills/<name>/SKILL.md`, with `name` and `description` in the frontmatter.
- **Generated adapters,** which are committed to the repo and never edited by hand. `scripts/sync-agents.mjs` produces them:
  - `.claude/rules` and `.claude/skills` are symlinks to `../.agents/rules` and `../.agents/skills`.
  - `.cursor/skills` is a symlink to `../.agents/skills`.
  - `.cursor/rules/<name>.mdc` files are generated, with `description`, `globs` and `alwaysApply`, and each carries a "GENERATED" banner.
  - `AGENTS.md` gets a rules index table between the `AGENT-RULES` markers, for tools that can't scope rules.
- **Drift protection:** `node scripts/sync-agents.mjs --check` runs in CI and in the pre-commit hook.
- `AGENTS.md` stays the entry point, and `CLAUDE.md` is a symlink to it.

## Alternatives considered
- **Keep `.cursor/rules` as the source.** Only Cursor would read it.
- **Use nested `AGENTS.md` files only.** Every tool can read them, but scoping would be per folder rather than per glob, and it would not cover skills.
- **Symlink every Cursor rule file.** Cursor's frontmatter keys (`globs`, `alwaysApply`) differ from the canonical ones, and I haven't verified that Cursor follows symlinked `.mdc` files. Generating the files avoids both problems.

## Consequences
- Supporting a new tool means adding one adapter to the sync script, not rewriting content.
- Symlinks need `core.symlinks=true` on Windows. Re-running the sync script repairs them.
- Everyone must remember to run the sync after editing a rule. The `--check` step enforces this.
