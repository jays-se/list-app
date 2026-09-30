# ADR-0011: Markdown docs in MVP

- **Status:** Accepted
- **Date:** 2026-09-30
- **Tickets:** E11-S2

## Context
The reference app uses Tiptap for docs. We have a minimal-dependency policy, and the requester chose D4: a markdown editor for the MVP.

## Decision
- Docs are edited in a textarea as markdown.
- The worker parses the markdown in-house into a safe AST, with an allow-list of node types, and never produces raw HTML.
- React renders that AST.
- Autosave is debounced inside the worker.

## Alternatives considered
- Tiptap now: an external dependency.
- A contentEditable editor built in-house: too large a job for the MVP.

## Consequences
- No WYSIWYG editing in the MVP.
- Rich text is to be re-evaluated in a new ADR after the MVP, with content migration from markdown.
