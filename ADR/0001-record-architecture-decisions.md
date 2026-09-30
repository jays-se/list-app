# ADR-0001: Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-09-30
- **Tickets:** E0-S2

## Context
Decisions need to be traceable across sessions, both human and agent.

## Decision
Every significant decision gets a numbered ADR in `ADR/`, using the format in `0000-template.md`. "Significant" means any of: a new dependency, a boundary or protocol change, a data-model change, a security-relevant choice, or reversing an earlier ADR. An ADR is never edited after it is accepted. To change a decision, write a new ADR that supersedes the old one.

## Alternatives considered
- Wiki pages: they drift away from the code.
- PR descriptions only: they are hard to discover later.

## Consequences
- Adds a small overhead to each decision.
- `docs/conversation/` links to the ADRs each session produced.
