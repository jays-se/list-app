# 2026-09-30 · When to add skills; conversation overview table

## What the requester asked
> "There's no skills added yet, are we gonna add skills in between or upfront?"
> "keep the overview of conversations as well in table view"

## Proposal on skills (**pending the requester's confirmation**)
- **Upfront:** process skills that don't depend on code: `ticket-workflow`, `write-adr`, `log-conversation`.
- **Just in time:** each code-pattern skill is written by the ticket that produces the first real example of that pattern.

  | Skill | Ticket |
  |---|---|
  | `add-ui-component` | E0-S5 |
  | `add-db-migration` | E2-S3 |
  | `add-worker-view` | E1-S4/S5 |
  | `add-api-endpoint` | E3-S3 |
  | `add-worker-action` | E4-S3 |
  | `write-e2e-test` | first Playwright spec |
  | `add-feature` | E4-S2 |

- **Why:** a skill written before its pattern exists describes code that doesn't exist yet. Agents copy it faithfully, so it spreads guesses.
- **Proposed Definition of Done addition:** "If this ticket introduced a new repeatable pattern, extract it into `.agents/skills/`."

## Decision: conversation overview
- `docs/conversation/README.md` holds a table with one row per session: date, topic, requester's ask, outcome, ADRs, and a link to the entry.
- Adding a conversation entry now also means adding its row. `AGENTS.md` workflow step 8 says so.

## Files changed
- New: `docs/conversation/README.md`
- Updated: `AGENTS.md`
