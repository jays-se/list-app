---
name: log-conversation
description: Record a user conversation that changed scope, decisions, or open questions in docs/conversation/ and its overview table. Use at the end of any session where the user decided something, asked for a change in direction, or answered an open question.
---

# Log a conversation

1. **Decide whether to log.** Log when the user made or changed a decision, added or removed scope, answered an open question, or raised a new one. Don't log routine implementation chatter.
2. **Write the entry** in `docs/conversation/YYYY-MM-DD-<topic>.md`, using an absolute date:
   ```md
   # YYYY-MM-DD · <Topic>

   ## What the requester asked
   > exact quotes of the relevant user messages

   ## What we found / proposed
   ## Decision            (or "Proposal (pending confirmation)")
   ## Still open
   ## Files changed
   ```
   - Quote the user verbatim. Don't paraphrase their words into a stronger claim.
   - Mark a proposal the user hasn't confirmed as **pending**.
3. **Add a row** to the overview table in `docs/conversation/README.md`, newest last. Fill in #, date, topic, what was asked, outcome, status (✅ decided, ⏳ pending, ♻️ superseded), ADRs, and a link to the entry.
4. **Update the "Open items" table** in the same README: add new open questions, and mark items resolved when this conversation closed them.
5. **When a pending item is later confirmed,** flip that row to ✅ and add a new row for the session that confirmed it. Don't erase the history.
