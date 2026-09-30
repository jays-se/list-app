---
name: write-adr
description: Create or supersede an Architecture Decision Record in ADR/. Use before adding a dependency, changing a boundary/protocol/data model/API contract, making a security-relevant choice, or reversing an existing ADR.
---

# Write an ADR

1. **Check existing ADRs.** Run `ls ADR/` and read any that touch the same area. If this decision changes one of them, you are **superseding** it.
2. **Number.** Take the next free 4-digit number. Never reuse a number.
3. **File.** Name it `ADR/NNNN-kebab-title.md` and copy the structure of `ADR/0000-template.md`:
   - **Status:** `Proposed` while the user hasn't confirmed; `Accepted` once the user has decided.
   - **Date:** today, as an absolute date (YYYY-MM-DD).
   - **Tickets:** the backlog IDs this decision affects.
   - **Context:** the forces and constraints. Quote the user if the request came from them.
   - **Decision:** a statement the reader can act on.
   - **Alternatives considered:** each option with the reason it was rejected.
   - **Consequences:** the good, the bad, and follow-up work.
4. **Superseding.** Accepted ADRs are immutable. Don't rewrite an old ADR's content. Change only its status line to `Superseded by ADR-NNNN`, and link back to it from the new ADR.
5. **Wire it in:**
   - If the plan or roadmap changes, add the ADR to the table in `docs/mvp-plan.md` §10.
   - Cite it from the affected backlog tickets, from `AGENTS.md` hard rules if it creates or changes one, and from the relevant `.agents/rules/*.md`.
   - Then run `pnpm sync:agents`.
   - If a conversation drove the decision, run the `log-conversation` skill.
