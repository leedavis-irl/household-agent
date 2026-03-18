# Decision log with rationale

**Sphere:** Engine
**Backlog item:** Decision log with rationale
**Depends on:** knowledge_store tool

## What to build

Provide a structured decision log for the household — major decisions with date, participants, rationale, and outcome. Distinct from the free-form knowledge base: this is for decisions like 'chose public school over private for Ryker because...' or 'switched from PG&E to community solar because...'

## Context

Knowledge store handles free-form facts. Decision logs need structure: what was decided, when, who was involved, why, and what alternatives were rejected. Follow the ADR (Architecture Decision Record) pattern from docs/decisions/.

## Implementation notes

Add `decisions` table via DB migration (title, description, rationale, alternatives_considered, participants, decided_at, category, status). Create `src/tools/decision-log.js` with `record` action (log a new decision) and `search` action (find past decisions by keyword/category). Categories: education, finance, home, health, logistics.

## Server requirements

- [ ] DB migration runs automatically

## Verification

- Ask Iji: "Log a decision: we chose to keep Ryker at John Muir because of the 504 support" → Creates decision record
- Ask Iji: "What education decisions have we made?" → Lists education-category decisions
- Ask Iji: "Why did we choose public school?" → Finds and returns the rationale

## Done when

- [ ] `decisions` table created via migration
- [ ] `decision_log` tool with record and search actions
- [ ] Category-based filtering
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Decision log with rationale" "In Review"
```

## Commit message

`feat: add structured household decision log`
