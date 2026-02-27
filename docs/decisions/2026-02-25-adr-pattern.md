# Decision: ADR Pattern + Research-to-Repo Rule

**Date:** 2026-02-25
**Status:** Accepted
**Decider:** Lee (with Claude as advisor)

## Context

Iji's biggest context-across-sessions problem isn't code — it's why the code is the way it is. Architectural decisions, research findings, and recommendations live in Claude.ai chat history and get buried. When a new Cursor session opens, the "why" is gone.

Separately, Jevon (from Signal group) described an ADR (Architecture Decision Record) pattern with indexing/archiving as his best trick for maintaining context across sessions in complex codebases.

## Decision

1. **`docs/decisions/` directory** for all architectural and strategic decisions, using the template in this directory's existing files as the pattern.
2. **Research-to-Repo Rule** added to DEV-PROTOCOL.md: when a Claude conversation produces actionable recommendations, they become decision records + backlog entries within 24 hours. The chat is disposable; the repo is the record.
3. **Backlog links to decisions.** Every backlog item that came from a decision links to its decision record.

## Rules

- One decision per file, named `YYYY-MM-DD-short-name.md`
- Append-only: never edit after accepted. Supersede with a new record if the decision changes.
- Cursor reads these for rationale when implementing specs that reference them.

## What Lives Where (reference)

| Content | Location | Primary reader |
|---------|----------|---------------|
| What to build | `BACKLOG.md` | Lee, Claude, Cursor |
| Why we decided X | `docs/decisions/` | Claude, Cursor |
| How to build it | `specs/` | Cursor |
| Engineering landmines | `.cursorrules` | Cursor |
| Design philosophy | `ARCHITECTURE.md` | Claude, Cursor |
| Build process | `DEV-PROTOCOL.md` | Claude, Cursor |
| Product eval framework | `GROWTH-PROTOCOL.md` | Claude |
| Ops runbooks | `docs/*.md` | Claude, Lee |
| Post-mortems | `docs/post-mortems/` | Claude (vaccination) |
| Prompt optimization log | `docs/prompt-optimization-log.md` | Claude, optimizer script |
