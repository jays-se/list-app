# 2026-09-30 · Follow-up decisions on the open questions

Picks up from `2026-09-30-mvp-planning.md` §4.

## Answers from the requester

| Question | Requester said | Resulting decision |
|---|---|---|
| Q3 Backend language | "Go ahead with Go" | ADR-0003 is now **Accepted** |
| Q2 Cloud | "Do we really need to use cloud services yet?" | **No.** One `docker compose` stack (Caddy, Go API, Postgres, MinIO) runs locally and later on a single VM. See ADR-0013 |
| Q1 Design system | "Create our own design system, you can take reference from Fluent UI design system 2" | Our own `@app/ui-kit`, built in-house to Fluent 2's token architecture, foundations and accessibility patterns, with no `@fluentui/*` packages. See ADR-0014 and new story **E0-S5** (Sprint 0) |
| Q4 DUE reminders | "yes" | DUE reminders are in the MVP, as a daily in-process job (E9-S1) |
| Q5 Member removal | "He can leave or workspace owner can remove him" | A member can leave, and an owner can remove a member. The detailed rules are assumption A7 in `mvp-plan.md` and new story **E3-S6** |

## Defaults I added (the requester can override these)
- **Last owner:** the last owner can't leave or be removed until they promote another member to owner. This needs `PATCH member {role}`, which is part of E3-S6.
- **When someone leaves or is removed:**
  - their access ends immediately
  - they're taken off open tasks as assignee, owner or checklist assignee, with history events recorded
  - their pending requests are cancelled
  - what they authored stays, shown as "a former member"
  - they can rejoin only with a valid invite code, and owners are prompted to rotate the code
- **Google Cloud:** a Google Cloud *project* is still needed for the OAuth client credentials. It is used only for identity configuration, not for hosting.

## Still open
- Q5 remainder: data retention periods and audit-log requirements.
- Brand colour for the design system. A placeholder ramp is used until one is chosen.

## Files changed
- `docs/mvp-plan.md` §2, §3, §7, §8 (E0-S5, E3-S6, E12-S4), §9, §10
- `docs/backlog/*` (regenerated)
- `ADR/0003`, `ADR/0009`, `ADR/0013` (new), `ADR/0014` (new)
- `AGENTS.md`
