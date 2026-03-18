# Conversation quality self-review

**Sphere:** Engine
**Backlog item:** Conversation quality self-review
**Depends on:** conversation_evals table, eval-logger.js

## What to build

After each conversation turn, Iji runs a lightweight self-review to detect potential quality issues — hallucinated facts, tool errors that were glossed over, or overly verbose responses. Logs quality flags for later analysis.

## Context

conversation_evals table already stores conversation data with quality_score, quality_notes, and failure_category columns (currently NULL). The eval logger (src/utils/eval-logger.js) writes to this table. The work is adding a post-response quality check.

## Implementation notes

Create `src/utils/quality-reviewer.js` that takes a completed conversation eval entry and runs a quick heuristic check: (1) did any tool return an error that the response didn't acknowledge? (2) is the response > 500 chars for a simple question? (3) did the response reference data not present in tool results? Log findings to quality_notes column. Run asynchronously after each brain loop completion (don't block the response).

## Server requirements

- [ ] No new env vars needed

## Verification

- Send a message that triggers a tool error → Verify quality flag is logged
- Send a simple greeting → Verify no false quality flags
- Query conversation_evals table → Verify quality_notes are populated

## Done when

- [ ] Quality reviewer runs after each conversation turn
- [ ] Flags tool errors, verbosity, and potential hallucinations
- [ ] Results stored in conversation_evals quality columns
- [ ] Runs asynchronously (doesn't slow down responses)
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Conversation quality self-review" "In Review"
```

## Commit message

`feat: add post-conversation quality self-review`
